"""Per-connection AI agent session (LangChain)."""

import asyncio
import contextlib
import logging
from typing import Any, ClassVar

from fastapi import WebSocket, WebSocketDisconnect
from langchain.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langchain_core.messages.ai import add_usage

from app.agents.langchain_assistant import AgentContext, get_agent
from app.agents.tools.rag_tool import extract_rag_trace, search_knowledge_base
from app.core.config import settings
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.llm_runtime import use_llm
from app.core.rate_limit import TurnRateLimiter
from app.db.models.user import User
from app.db.session import get_db_context
from app.graph.generation_correction import GenerationCorrector
from app.services.agent import (
    build_message_history,
    persist_assistant_turn,
    persist_user_turn,
    send_event,
)
from app.services.llm_config import load_runtime
from app.services.rag.generation.followups import suggest_followups

logger = logging.getLogger(__name__)

_server_turn_limiter = TurnRateLimiter(
    settings.SERVER_LLM_TURNS_PER_MINUTE, settings.SERVER_LLM_TURNS_PER_DAY
)


class AgentSession:
    """One WebSocket session with the LangChain agent."""

    # Control frames this session implements, beyond `stop`. Anything else with
    # a `type` is ignored rather than treated as a prompt.
    _HANDLED_FRAME_TYPES: ClassVar[frozenset[str]] = frozenset({"message"})

    def __init__(
        self,
        websocket: WebSocket,
        user: User,
    ) -> None:
        self.websocket = websocket
        self.user = user
        self.conversation_history: list[dict[str, str]] = []
        self.context: AgentContext = {}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
        self.current_conversation_id: str | None = None
        self._last_usage_metadata: Any = None
        # TODO: reasoning is streamed to the UI (thinking_delta) but not collected for
        # persistence here — Message.thinking stays empty for this framework. The text is
        # already extracted below; accumulate it per turn and pass it to
        # persist_assistant_turn(thinking=...) like the PydanticAI session does.
        self._thinking_streamed: bool = False
        self._turn_task: asyncio.Task[None] | None = None
        self._buffer_text_for_verification = False
        # Structured trace events of the turn in progress; stored with the assistant message.
        self._turn_trace: list[dict[str, Any]] = []
        self._turn_evidence = ""
        self._followup_task: asyncio.Task[None] | None = None

    async def handle_frame(self, data: dict[str, Any]) -> None:
        """Dispatch one incoming WebSocket frame.

        A ``stop`` cancels the running turn; any other frame starts a new turn as
        a cancellable background task. Clients serialize turns, so a frame that
        arrives while a turn is running is ignored.
        """
        msg_type = data.get("type")

        if msg_type == "stop":
            await self._cancel_turn()
            return

        # A frame carrying a `type` this session does not implement is a control
        # frame, not a prompt — the shared frontend hook emits `resume` and
        # `ask_user_response` regardless of which framework is generated. Falling
        # through would start a turn with an empty message and answer the user
        # with "Empty message".
        if msg_type is not None and msg_type not in self._HANDLED_FRAME_TYPES:
            logger.debug("Ignoring unsupported control frame: %s", msg_type)
            return

        if self._turn_task is not None and not self._turn_task.done():
            logger.warning("Ignoring message received while a turn is already in progress")
            return
        task = asyncio.create_task(self._run_turn(data))
        self._turn_task = task
        task.add_done_callback(self._on_turn_done)

    def _on_turn_done(self, task: asyncio.Task[None]) -> None:
        """Clear the turn slot and surface unexpected crashes."""
        if self._turn_task is task:
            self._turn_task = None
        if not task.cancelled():
            exc = task.exception()
            if isinstance(exc, WebSocketDisconnect):
                logger.info("Client disconnected during agent turn")
            elif exc is not None:
                logger.error("Agent turn task crashed", exc_info=exc)

    async def _run_turn(self, data: dict[str, Any]) -> None:
        """Run one turn, emitting a terminal ``complete`` even when stopped."""
        try:
            await self.process_message(data)
        except asyncio.CancelledError:
            await send_event(
                self.websocket,
                "complete",
                {
                    "conversation_id": self.current_conversation_id,
                    "stopped": True,
                },
            )
            raise

    async def _cancel_turn(self) -> None:
        """Cancel the in-flight turn task and wait for it to unwind."""
        task = self._turn_task
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def shutdown(self) -> None:
        """Cancel any in-flight turn."""
        if self._followup_task and not self._followup_task.done():
            self._followup_task.cancel()
        await self._cancel_turn()

    async def process_message(self, data: dict[str, Any]) -> None:
        """Run one turn against the user's own model when they configured one."""
        async with get_db_context() as db:
            runtime = await load_runtime(db, self.user.id)
        if runtime is None:
            wait = _server_turn_limiter.check(str(self.user.id))
            if wait is not None:
                await send_event(
                    self.websocket,
                    "error",
                    {
                        "message": f"提问太频繁了，请 {int(wait) + 1} 秒后再试（或在“模型设置”里用自己的模型）"
                    },
                )
                return
        with use_llm(runtime):
            await self._process_message(data)

    async def _process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the agent, stream events, persist output."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return
        try:
            self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
                self.user,
                user_message,
                file_ids,
                requested_conversation_id=data.get("conversation_id"),
                current_conversation_id=self.current_conversation_id,
            )
        except (NotFoundError, AuthorizationError) as e:
            # A conversation this user may not write to: refuse the turn, so
            # nothing - the prompt or the agent's reply - lands in it.
            await send_event(self.websocket, "error", {"message": e.message})
            return
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )

        await send_event(self.websocket, "user_prompt", {"content": user_message})
        self._turn_trace = []
        if self._followup_task and not self._followup_task.done():
            self._followup_task.cancel()

        try:
            assistant = get_agent(
                model_name=data.get("model"),
                thinking_effort=data.get("thinking_effort"),
            )
            model_history = build_message_history(self.conversation_history)
            model_history.append(HumanMessage(content=user_message))
            collected_tool_calls: list[dict[str, Any]] = []
            final_output = await self._stream_agent_response(
                assistant, model_history, collected_tool_calls
            )
            final_output = await self._correct_answer_if_enabled(
                user_message, final_output, collected_tool_calls
            )
            if self._buffer_text_for_verification and final_output:
                await self._stream_verified_output(final_output)
            await send_event(self.websocket, "final_result", {"output": final_output})

            # Update in-memory history only after the agent produced output
            if final_output:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append({"role": "assistant", "content": final_output})
            assistant_msg_id: str | None = None
            if self.current_conversation_id and final_output:
                assistant_msg_id = await persist_assistant_turn(
                    self.current_conversation_id,
                    final_output,
                    getattr(assistant, "model_name", None),
                    collected_tool_calls,
                    agent_trace=self._turn_trace,
                )

            if assistant_msg_id:
                await send_event(
                    self.websocket,
                    "message_saved",
                    {
                        "message_id": assistant_msg_id,
                        "conversation_id": self.current_conversation_id,
                    },
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
            self._start_followups(user_message, final_output, assistant_msg_id)
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception("Error processing agent request")
            await send_event(self.websocket, "error", {"message": str(e)})

    async def _stream_agent_response(
        self,
        assistant: Any,
        model_history: list[Any],
        collected_tool_calls: list[dict[str, Any]],
    ) -> str:
        """Run ``assistant.agent.astream`` and forward all events; return accumulated text."""
        final_output = ""
        seen_tool_call_ids: set[str] = set()
        pending: dict[str, dict[str, Any]] = {}
        # Sum usage_metadata across the turn's model calls. We add only the
        # usage dicts (via add_usage), never whole chunks — merging full
        # AIMessageChunks via `+` crashes on scalar additional_kwargs like the
        # OpenAI Responses API's float ``created_at``.
        self._last_usage_metadata = None
        # Per-turn flag: did we already stream reasoning from token chunks?
        # If not, _stream_update_event falls back to the final message's
        # reasoning so thinking is shown for providers that don't stream it.
        self._thinking_streamed = False
        self._buffer_text_for_verification = settings.rag.generation_correction_config.enabled

        await send_event(self.websocket, "model_request_start", {})

        async for stream_mode, data in assistant.agent.astream(
            {"messages": model_history},
            stream_mode=["messages", "updates"],
            config={"configurable": self.context} if self.context else None,
        ):
            if stream_mode == "messages":
                token, _metadata = data
                if isinstance(token, AIMessageChunk):
                    if token.usage_metadata:
                        self._last_usage_metadata = (
                            token.usage_metadata
                            if self._last_usage_metadata is None
                            else add_usage(self._last_usage_metadata, token.usage_metadata)
                        )
                    final_output += await self._stream_message_chunk(token)
            elif stream_mode == "updates":
                await self._stream_update_event(
                    data, seen_tool_call_ids, pending, collected_tool_calls
                )

        return final_output

    async def _correct_answer_if_enabled(
        self,
        question: str,
        answer: str,
        collected_tool_calls: list[dict[str, Any]],
    ) -> str:
        """Apply P3 verification after generation, before final text reaches the client."""
        config = settings.rag.generation_correction_config
        if not config.enabled or not answer:
            return answer
        evidence = await self._collect_evidence(question, collected_tool_calls)
        self._turn_evidence = evidence
        result = await GenerationCorrector(
            evidence_search=search_knowledge_base,
            max_corrections=config.max_corrections,
        ).run(question, answer, evidence)
        for event in result.trace:
            await self._send_trace(event.model_dump(mode="json"))
        return result.answer

    def _start_followups(self, question: str, answer: str, message_id: str | None) -> None:
        """Suggest follow-up questions outside the turn so the next question is never blocked."""

        async def run() -> None:
            suggestions = await suggest_followups(question, answer, self._turn_evidence)
            if suggestions:
                await send_event(
                    self.websocket, "suggestions", {"message_id": message_id, "items": suggestions}
                )

        if self._followup_task and not self._followup_task.done():
            self._followup_task.cancel()
        self._followup_task = asyncio.create_task(run(), name="followup-suggestions")

    async def _send_trace(self, event: dict[str, Any]) -> None:
        """Record a trace event for persistence and push it to the client."""
        self._turn_trace.append(event)
        await send_event(self.websocket, "agent_trace", event)

    async def _collect_evidence(
        self, question: str, collected_tool_calls: list[dict[str, Any]]
    ) -> str:
        """Gather the turn's retrieval evidence, forcing a search if the model skipped the tool.

        ``tool_choice="required"`` is not honoured by every OpenAI-compatible provider (Ollama
        included), so a turn can finish without any ``search_documents`` call. Verifying such an
        answer against empty evidence would wrongly report that the knowledge base has no answer,
        so run the same corrective retrieval here and let P3 verify against its evidence.
        """
        searched = [
            call for call in collected_tool_calls if call.get("tool_name") == "search_documents"
        ]
        if not searched:
            logger.warning("agent_skipped_search_tool: forcing retrieval for verification")
            visible, trace = extract_rag_trace(await search_knowledge_base(question))
            for event in trace:
                await self._send_trace(event)
            return visible
        return (chr(10) * 2).join(str(call["result"]) for call in searched if call.get("result"))

    async def _stream_verified_output(self, output: str) -> None:
        """Stream only post-verification text, preserving the chat rendering contract."""
        await send_event(self.websocket, "draft_clear", {})
        for start in range(0, len(output), 80):
            await send_event(self.websocket, "text_delta", {"content": output[start : start + 80]})

    @staticmethod
    def _extract_reasoning(message: Any) -> str:
        """Pull reasoning/thinking text from a LangChain message or chunk.

        Covers three shapes:
          * Anthropic extended thinking — ``{"type":"thinking","thinking":"..."}``
          * OpenAI Responses API — ``{"type":"reasoning","summary":[{"type":"summary_text","text":"..."}]}``
          * Legacy providers — ``additional_kwargs.reasoning_content`` (string)
        """
        out = ""
        content = getattr(message, "content", None)
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "thinking":
                    out += block.get("thinking", "") or ""
                elif btype == "reasoning":
                    for summary in block.get("summary", []) or []:
                        if isinstance(summary, dict) and summary.get("type") == "summary_text":
                            out += summary.get("text", "") or ""
        legacy = (getattr(message, "additional_kwargs", None) or {}).get("reasoning_content")
        if isinstance(legacy, str):
            out += legacy
        return out

    async def _stream_message_chunk(self, token: AIMessageChunk) -> str:
        """Emit text + reasoning deltas from a streaming chunk.

        Tool calls are intentionally NOT emitted here. Streamed
        ``tool_call_chunks`` carry only partial JSON-string argument
        fragments, not a usable args dict — emitting from here produced
        ``tool_call`` events with empty ``args`` (and, because they were
        deduped against the same id set, suppressed the complete event).
        The canonical tool call, with full args, is emitted from the
        ``updates`` stream in ``_stream_update_event``.
        """
        text_content = ""
        if token.content:
            if isinstance(token.content, str):
                text_content = token.content
            elif isinstance(token.content, list):
                for block in token.content:
                    if isinstance(block, str):
                        text_content += block
                    elif isinstance(block, dict) and block.get("type") == "text":
                        text_content += block.get("text", "")
            if text_content:
                # With verification on, the live text is only a draft: the client shows it
                # marked "checking" and replaces it with the verified answer.
                event = "draft_delta" if self._buffer_text_for_verification else "text_delta"
                await send_event(self.websocket, event, {"content": text_content})

        reasoning_content = self._extract_reasoning(token)
        if reasoning_content:
            self._thinking_streamed = True
            await send_event(self.websocket, "thinking_delta", {"content": reasoning_content})
        return text_content

    async def _stream_update_event(
        self,
        update_data: dict[str, Any],
        seen_tool_call_ids: set[str],
        pending: dict[str, dict[str, Any]],
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Process ``updates`` stream events — the source of truth for tools.

        Tool calls here carry the complete name + parsed ``args`` from
        ``AIMessage.tool_calls`` (unlike the partial streamed chunks). Also
        emits a reasoning fallback for providers that attach the chain of
        thought to the final message instead of streaming it.
        """
        for node_name, update in update_data.items():
            if node_name == "tools":
                for msg in update.get("messages", []):
                    if isinstance(msg, ToolMessage):
                        tc = pending.get(msg.tool_call_id)
                        visible_content, trace = extract_rag_trace(str(msg.content))
                        if tc is not None:
                            tc["result"] = visible_content
                        for trace_event in trace:
                            await self._send_trace(trace_event)
                        await send_event(
                            self.websocket,
                            "tool_result",
                            {"tool_call_id": msg.tool_call_id, "content": visible_content},
                        )
            elif node_name == "model":
                for msg in update.get("messages", []):
                    if not isinstance(msg, AIMessage):
                        continue
                    if not self._thinking_streamed:
                        reasoning = self._extract_reasoning(msg)
                        if reasoning:
                            self._thinking_streamed = True
                            await send_event(
                                self.websocket,
                                "thinking_delta",
                                {"content": reasoning},
                            )
                    for tc_in in msg.tool_calls or []:
                        tc_id = tc_in.get("id", "")
                        if not tc_id:
                            continue
                        tc = {
                            "tool_call_id": tc_id,
                            "tool_name": tc_in.get("name", ""),
                            "args": tc_in.get("args", {}),
                        }
                        pending[tc_id] = tc
                        collected_tool_calls.append(tc)
                        if tc_id not in seen_tool_call_ids:
                            seen_tool_call_ids.add(tc_id)
                            await send_event(self.websocket, "tool_call", tc)

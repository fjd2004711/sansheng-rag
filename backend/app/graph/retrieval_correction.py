"""P2 bounded LangGraph workflow for retrieval self-correction."""

from __future__ import annotations

from typing import Protocol

from langgraph.graph import END, START, StateGraph

from app.services.rag.correction.evaluator import EvidenceEvaluator
from app.services.rag.correction.models import (
    CorrectionAction,
    CorrectionTraceEvent,
    CorrectiveRetrievalResult,
    CorrectiveRetrievalState,
    Diagnosis,
    EvidenceAssessment,
)
from app.services.rag.models import SearchResult


def summarize_results(docs: list[SearchResult], limit: int = 10) -> list[dict[str, object]]:
    """Compact, UI-safe view of retrieved chunks for the trace: where each came from and how it scored."""
    summary: list[dict[str, object]] = []
    for doc in docs[:limit]:
        meta = doc.metadata
        scores = {
            name: round(float(meta[name]), 4)
            for name in ("dense_score", "bm25_score", "rrf_score", "reranker_score")
            if isinstance(meta.get(name), (int, float))
        }
        summary.append(
            {
                "source": str(meta.get("filename") or "未知来源"),
                "page": meta.get("page_num"),
                "chunk": meta.get("chunk_num"),
                "snippet": " ".join(doc.content.split())[:160],
                "scores": scores,
            }
        )
    return summary


class QueryRetriever(Protocol):
    """The narrow retrieval interface P2 needs from P0/P1."""

    async def search(self, query: str) -> list[SearchResult]: ...


class EvidenceGrader(Protocol):
    async def assess(
        self, question: str, query: str, docs: list[SearchResult]
    ) -> EvidenceAssessment: ...

    async def diagnose(
        self, question: str, query: str, assessment: EvidenceAssessment
    ) -> Diagnosis: ...


class CorrectiveRetriever:
    """Diagnose retrieval failures, then perform a bounded corrective search."""

    def __init__(
        self,
        retriever: QueryRetriever,
        evaluator: EvidenceGrader | None = None,
        max_rounds: int = 2,
    ) -> None:
        if max_rounds < 1:
            raise ValueError("max_rounds must be at least 1")
        self.retriever = retriever
        self.evaluator = evaluator or EvidenceEvaluator()
        self.max_rounds = max_rounds
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(CorrectiveRetrievalState)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("evaluate", self._evaluate)
        graph.add_node("diagnose", self._diagnose)
        graph.add_node("rewrite", self._rewrite)
        graph.add_node("abstain", self._abstain)
        graph.add_node("limit", self._limit)
        graph.add_edge(START, "retrieve")
        graph.add_edge("retrieve", "evaluate")
        graph.add_conditional_edges(
            "evaluate", self._after_evaluate, {"pass": END, "diagnose": "diagnose"}
        )
        graph.add_conditional_edges(
            "diagnose",
            self._after_diagnose,
            {"rewrite": "rewrite", "abstain": "abstain", "limit": "limit"},
        )
        graph.add_edge("rewrite", "retrieve")
        graph.add_edge("abstain", END)
        graph.add_edge("limit", END)
        return graph.compile()

    async def run(
        self, question: str, initial_query: str | None = None
    ) -> CorrectiveRetrievalResult:
        """Run one question through the graph and keep an auditable trace."""
        query = initial_query or question
        state = await self.graph.ainvoke(
            {
                "question": question,
                "current_query": query,
                "query_history": [query],
                "retrieved_docs": [],
                "relevance_scores": [],
                "missing_information": [],
                "failure_type": None,
                "failure_reason": "",
                "abstained": False,
                "retrieval_round": 0,
                "trace": [],
            }
        )
        return CorrectiveRetrievalResult(
            question=state["question"],
            current_query=state["current_query"],
            query_history=state["query_history"],
            retrieved_docs=state["retrieved_docs"],
            relevance_scores=state["relevance_scores"],
            missing_information=state["missing_information"],
            failure_type=state.get("failure_type"),
            failure_reason=state.get("failure_reason", ""),
            retrieval_round=state["retrieval_round"],
            abstained=state.get("abstained", False),
            trace=[CorrectionTraceEvent.model_validate(event) for event in state["trace"]],
        )

    async def _retrieve(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        retrieval_round = state["retrieval_round"] + 1
        docs = await self.retriever.search(state["current_query"])
        return {
            "retrieved_docs": docs,
            "retrieval_round": retrieval_round,
            "trace": self._append_trace(
                state,
                step="retrieve",
                round=retrieval_round,
                status="COMPLETE",
                detail={
                    "query": state["current_query"],
                    "result_count": len(docs),
                    "results": summarize_results(docs),
                },
            ),
        }

    async def _evaluate(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        assessment = await self.evaluator.assess(
            state["question"], state["current_query"], state["retrieved_docs"]
        )
        return {
            "relevance_scores": assessment.relevance_scores,
            "missing_information": assessment.missing_information,
            "failure_type": assessment.failure_type.value if assessment.failure_type else None,
            "failure_reason": assessment.failure_reason,
            "assessment_sufficient": assessment.sufficient,
            "trace": self._append_trace(
                state,
                step="evidence_evaluate",
                round=state["retrieval_round"],
                status="PASS" if assessment.sufficient else "FAIL",
                detail={
                    "relevance_scores": assessment.relevance_scores,
                    "sufficient": assessment.sufficient,
                    "missing_information": assessment.missing_information,
                    "failure_type": assessment.failure_type.value if assessment.failure_type else None,
                    "failure_reason": assessment.failure_reason,
                },
            ),
        }

    async def _diagnose(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        assessment = EvidenceAssessment(
            relevance_scores=state["relevance_scores"],
            sufficient=False,
            missing_information=state["missing_information"],
            failure_type=state.get("failure_type"),
            failure_reason=state["failure_reason"],
        )
        diagnosis = await self.evaluator.diagnose(
            state["question"], state["current_query"], assessment
        )
        return {
            "diagnosis_action": diagnosis.action.value,
            "failure_type": diagnosis.failure_type.value,
            "failure_reason": diagnosis.failure_reason,
            "missing_information": diagnosis.missing_information,
            "pending_query": diagnosis.rewritten_query,
            "trace": self._append_trace(
                state,
                step="failure_diagnose",
                round=state["retrieval_round"],
                status=diagnosis.action.value.upper(),
                detail={
                    "action": diagnosis.action.value,
                    "failure_type": diagnosis.failure_type.value,
                    "failure_reason": diagnosis.failure_reason,
                    "missing_information": diagnosis.missing_information,
                    "rewritten_query": diagnosis.rewritten_query,
                },
            ),
        }

    async def _rewrite(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        rewritten = state.get("pending_query") or state["question"]
        history = [*state["query_history"]]
        if rewritten != history[-1]:
            history.append(rewritten)
        return {
            "current_query": rewritten,
            "query_history": history,
            "trace": self._append_trace(
                state,
                step="query_rewrite",
                round=state["retrieval_round"],
                status="COMPLETE",
                detail={"from": state["current_query"], "to": rewritten},
            ),
        }

    async def _abstain(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        return {
            "abstained": True,
            "trace": self._append_trace(
                state,
                step="abstain",
                round=state["retrieval_round"],
                status="COMPLETE",
                detail={"reason": state["failure_reason"]},
            ),
        }

    async def _limit(self, state: CorrectiveRetrievalState) -> CorrectiveRetrievalState:
        return {
            "trace": self._append_trace(
                state,
                step="max_rounds_reached",
                round=state["retrieval_round"],
                status="STOP",
                detail={"max_rounds": self.max_rounds, "reason": state["failure_reason"]},
            ),
        }

    def _after_evaluate(self, state: CorrectiveRetrievalState) -> str:
        return "pass" if state.get("assessment_sufficient", False) else "diagnose"

    def _after_diagnose(self, state: CorrectiveRetrievalState) -> str:
        if state.get("diagnosis_action") == CorrectionAction.ABSTAIN.value:
            return "abstain"
        if state["retrieval_round"] >= self.max_rounds:
            return "limit"
        return "rewrite"

    @staticmethod
    def _append_trace(
        state: CorrectiveRetrievalState,
        *,
        step: str,
        round: int,
        status: str,
        detail: dict[str, object],
    ) -> list[dict[str, object]]:
        event = CorrectionTraceEvent(
            step=step, round=round, status=status, detail=detail
        )
        return [*state["trace"], event.model_dump(mode="json")]

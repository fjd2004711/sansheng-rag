"""P3 bounded LangGraph workflow for answer verification and correction."""

from __future__ import annotations

from typing import Awaitable, Callable, Protocol

from langgraph.graph import END, START, StateGraph

from app.services.rag.generation.evaluator import AnswerEvaluator, _ABSTAIN_MESSAGE, _has_evidence
from app.services.rag.generation.models import (
    AnswerAssessment,
    AnswerFailureType,
    GenerationCorrectionResult,
    GenerationCorrectionState,
    GenerationTraceEvent,
)


class AnswerGrader(Protocol):
    async def assess(self, question: str, answer: str, evidence: str) -> AnswerAssessment: ...

    async def diagnose(self, question: str, assessment: AnswerAssessment): ...

    async def regenerate(self, question: str, evidence: str) -> str: ...


EvidenceSearch = Callable[[str], Awaitable[str]]


class GenerationCorrector:
    """Verify an answer and perform at most a configured number of corrections."""

    def __init__(
        self,
        evidence_search: EvidenceSearch,
        evaluator: AnswerGrader | None = None,
        max_corrections: int = 1,
    ) -> None:
        if max_corrections < 1:
            raise ValueError("max_corrections must be at least 1")
        self.evidence_search = evidence_search
        self.evaluator = evaluator or AnswerEvaluator()
        self.max_corrections = max_corrections
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(GenerationCorrectionState)
        graph.add_node("verify", self._verify)
        graph.add_node("diagnose", self._diagnose)
        graph.add_node("retrieve_missing", self._retrieve_missing)
        graph.add_node("regenerate", self._regenerate)
        graph.add_node("reverify", self._reverify)
        graph.add_node("abstain", self._abstain)
        graph.add_edge(START, "verify")
        graph.add_conditional_edges(
            "verify",
            self._after_verify,
            {
                "pass": END,
                "regenerate": "regenerate",
                "diagnose": "diagnose",
                "abstain": "abstain",
            },
        )
        graph.add_conditional_edges(
            "diagnose",
            self._after_diagnose,
            {"retrieve": "retrieve_missing", "abstain": "abstain"},
        )
        graph.add_edge("retrieve_missing", "regenerate")
        graph.add_edge("regenerate", "reverify")
        graph.add_conditional_edges(
            "reverify", self._after_reverify, {"pass": END, "abstain": "abstain"}
        )
        graph.add_edge("abstain", END)
        return graph.compile()

    async def run(
        self, question: str, answer: str, evidence: str
    ) -> GenerationCorrectionResult:
        state = await self.graph.ainvoke(
            {
                "question": question,
                "answer": answer,
                "evidence": evidence,
                "correction_round": 0,
                "abstained": False,
                "trace": [],
            }
        )
        return GenerationCorrectionResult(
            answer=state["answer"],
            evidence=state["evidence"],
            assessment=state["assessment"],
            correction_round=state["correction_round"],
            abstained=state.get("abstained", False),
            trace=[GenerationTraceEvent.model_validate(event) for event in state["trace"]],
        )

    async def _verify(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        assessment = await self.evaluator.assess(
            state["question"], state["answer"], state["evidence"]
        )
        return self._assessment_update(state, assessment, step="answer_verify")

    async def _diagnose(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        diagnosis = await self.evaluator.diagnose(state["question"], state["assessment"])
        return {
            "diagnosis": diagnosis,
            "sub_query": diagnosis.sub_query,
            "failure_type": diagnosis.failure_type.value,
            "failure_reason": diagnosis.failure_reason,
            "trace": self._append_trace(
                state,
                step="answer_diagnose",
                status=("ABSTAIN" if diagnosis.failure_type == AnswerFailureType.OUT_OF_SCOPE else "RETRIEVE"),
                detail={
                    "failure_type": diagnosis.failure_type.value,
                    "failure_reason": diagnosis.failure_reason,
                    "missing_information": diagnosis.missing_information,
                    "sub_query": diagnosis.sub_query,
                },
            ),
        }

    async def _retrieve_missing(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        query = state.get("sub_query") or state["question"]
        evidence = await self.evidence_search(query)
        return {
            "evidence": evidence,
            "trace": self._append_trace(
                state,
                step="retrieve_missing",
                status="COMPLETE" if _has_evidence(evidence) else "EMPTY",
                detail={"query": query, "has_evidence": _has_evidence(evidence)},
            ),
        }

    async def _regenerate(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        next_round = state["correction_round"] + 1
        if not _has_evidence(state["evidence"]):
            return {
                "correction_round": next_round,
                "answer": _ABSTAIN_MESSAGE,
                "abstained": True,
                "trace": self._append_trace(
                    state,
                    step="regenerate",
                    status="ABSTAIN",
                    detail={"reason": "No evidence available for corrective generation."},
                ),
            }
        answer = await self.evaluator.regenerate(state["question"], state["evidence"])
        return {
            "answer": answer,
            "correction_round": next_round,
            "trace": self._append_trace(
                state,
                step="regenerate",
                status="COMPLETE",
                detail={"evidence_reused": True},
            ),
        }

    async def _reverify(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        if state.get("abstained", False):
            assessment = AnswerAssessment(
                groundedness=0,
                completeness=0,
                answer_relevance=1,
                citation_coverage=0,
                sufficient=False,
                failure_type=AnswerFailureType.OUT_OF_SCOPE,
                failure_reason="No evidence was available for corrective generation.",
            )
        else:
            assessment = await self.evaluator.assess(
                state["question"], state["answer"], state["evidence"]
            )
        return self._assessment_update(state, assessment, step="answer_reverify")

    async def _abstain(self, state: GenerationCorrectionState) -> GenerationCorrectionState:
        return {
            "answer": _ABSTAIN_MESSAGE,
            "abstained": True,
            "trace": self._append_trace(
                state,
                step="abstain",
                status="COMPLETE",
                detail={"reason": state.get("failure_reason", "")},
            ),
        }

    def _after_verify(self, state: GenerationCorrectionState) -> str:
        assessment = state["assessment"]
        if assessment.sufficient:
            return "pass"
        if assessment.failure_type == AnswerFailureType.OUT_OF_SCOPE:
            return "abstain"
        if state["correction_round"] >= self.max_corrections:
            return "abstain"
        if assessment.failure_type == AnswerFailureType.HALLUCINATION:
            return "regenerate"
        return "diagnose"

    def _after_diagnose(self, state: GenerationCorrectionState) -> str:
        diagnosis = state["diagnosis"]
        if diagnosis.failure_type == AnswerFailureType.OUT_OF_SCOPE or not diagnosis.sub_query:
            return "abstain"
        return "retrieve"

    def _after_reverify(self, state: GenerationCorrectionState) -> str:
        return "pass" if state["assessment"].sufficient and not state.get("abstained") else "abstain"

    def _assessment_update(
        self,
        state: GenerationCorrectionState,
        assessment: AnswerAssessment,
        *,
        step: str,
    ) -> GenerationCorrectionState:
        return {
            "assessment": assessment,
            "failure_type": assessment.failure_type.value if assessment.failure_type else None,
            "failure_reason": assessment.failure_reason,
            "missing_information": assessment.missing_information,
            "trace": self._append_trace(
                state,
                step=step,
                status="PASS" if assessment.sufficient else "FAIL",
                detail={
                    "groundedness": assessment.groundedness,
                    "completeness": assessment.completeness,
                    "answer_relevance": assessment.answer_relevance,
                    "citation_coverage": assessment.citation_coverage,
                    "failure_type": assessment.failure_type.value if assessment.failure_type else None,
                    "failure_reason": assessment.failure_reason,
                    "missing_information": assessment.missing_information,
                    "claim_count": len(assessment.claims),
                },
            ),
        }

    @staticmethod
    def _append_trace(
        state: GenerationCorrectionState,
        *,
        step: str,
        status: str,
        detail: dict[str, object],
    ) -> list[dict[str, object]]:
        event = GenerationTraceEvent(
            step=step,
            round=state["correction_round"],
            status=status,
            detail=detail,
        )
        return [*state["trace"], event.model_dump(mode="json")]

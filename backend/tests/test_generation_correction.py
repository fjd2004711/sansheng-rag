"""P3 graph routing tests without calls to the provider or vector database."""

import pytest

from app.graph.generation_correction import GenerationCorrector
from app.services.rag.generation.models import (
    AnswerAssessment,
    AnswerDiagnosis,
    AnswerFailureType,
)


def assessment(
    sufficient: bool, failure_type: AnswerFailureType | None = None
) -> AnswerAssessment:
    return AnswerAssessment(
        groundedness=1.0 if sufficient else 0.2,
        completeness=1.0 if sufficient else 0.3,
        answer_relevance=1.0,
        citation_coverage=1.0 if sufficient else 0.0,
        sufficient=sufficient,
        failure_type=failure_type,
        failure_reason="verification failed" if not sufficient else "",
        missing_information=["required detail"] if not sufficient else [],
    )


class FakeEvaluator:
    def __init__(self, initial: AnswerAssessment, after_regeneration: AnswerAssessment) -> None:
        self.initial = initial
        self.after_regeneration = after_regeneration
        self.regenerated: list[str] = []
        self.diagnosed = 0

    async def assess(self, question: str, answer: str, evidence: str) -> AnswerAssessment:
        return self.after_regeneration if self.regenerated else self.initial

    async def diagnose(self, question: str, value: AnswerAssessment) -> AnswerDiagnosis:
        self.diagnosed += 1
        return AnswerDiagnosis(
            failure_type=value.failure_type or AnswerFailureType.INSUFFICIENT_EVIDENCE,
            sub_query="specific missing evidence",
            failure_reason=value.failure_reason,
            missing_information=value.missing_information,
        )

    async def regenerate(self, question: str, evidence: str) -> str:
        self.regenerated.append(evidence)
        return "Corrected, evidence-grounded answer [1]."


@pytest.mark.anyio
async def test_hallucination_regenerates_from_existing_evidence_without_retrieval() -> None:
    evaluator = FakeEvaluator(
        assessment(False, AnswerFailureType.HALLUCINATION), assessment(True)
    )
    queries: list[str] = []

    async def search(query: str) -> str:
        queries.append(query)
        return "unexpected"

    result = await GenerationCorrector(search, evaluator).run(
        "What does the policy require?", "Unsupported answer", "[1] Policy requires a signed form."
    )

    assert result.answer == "Corrected, evidence-grounded answer [1]."
    assert result.correction_round == 1
    assert not result.abstained
    assert queries == []
    assert [event.step for event in result.trace] == [
        "answer_verify",
        "regenerate",
        "answer_reverify",
    ]


@pytest.mark.anyio
async def test_incomplete_answer_uses_a_subquery_then_regenerates() -> None:
    evaluator = FakeEvaluator(assessment(False, AnswerFailureType.INCOMPLETE), assessment(True))
    queries: list[str] = []

    async def search(query: str) -> str:
        queries.append(query)
        return "[1] The missing required detail is recorded here."

    result = await GenerationCorrector(search, evaluator).run(
        "What is the required detail?", "Partial answer [1].", "[1] A related note."
    )

    assert not result.abstained
    assert queries == ["specific missing evidence"]
    assert evaluator.diagnosed == 1
    assert evaluator.regenerated == ["[1] The missing required detail is recorded here."]
    assert [event.step for event in result.trace] == [
        "answer_verify",
        "answer_diagnose",
        "retrieve_missing",
        "regenerate",
        "answer_reverify",
    ]


@pytest.mark.anyio
async def test_out_of_scope_answer_abstains_without_retry() -> None:
    evaluator = FakeEvaluator(assessment(False, AnswerFailureType.OUT_OF_SCOPE), assessment(True))

    async def search(query: str) -> str:
        raise AssertionError("out-of-scope answers must not trigger another search")

    result = await GenerationCorrector(search, evaluator).run("Unknown topic", "Guess", "[1] Other topic")

    assert result.abstained
    assert result.answer == "知识库中没有找到足以回答该问题的证据。"
    assert result.correction_round == 0
    assert [event.step for event in result.trace] == ["answer_verify", "abstain"]


@pytest.mark.anyio
async def test_failed_corrective_generation_stops_at_the_configured_bound() -> None:
    evaluator = FakeEvaluator(
        assessment(False, AnswerFailureType.HALLUCINATION),
        assessment(False, AnswerFailureType.HALLUCINATION),
    )

    async def search(query: str) -> str:
        raise AssertionError("hallucination correction uses existing evidence")

    result = await GenerationCorrector(search, evaluator, max_corrections=1).run(
        "Question", "Unsupported", "[1] Evidence"
    )

    assert result.abstained
    assert result.correction_round == 1
    assert result.trace[-1].step == "abstain"


def partial_assessment(groundedness: float, citation_coverage: float = 1.0) -> AnswerAssessment:
    return AnswerAssessment(
        groundedness=groundedness,
        completeness=0.4,
        answer_relevance=0.9,
        citation_coverage=citation_coverage,
        sufficient=False,
        failure_type=AnswerFailureType.INCOMPLETE,
        failure_reason="part of the question is not covered",
        missing_information=["consequence of missing a class observation"],
    )


@pytest.mark.anyio
async def test_faithful_but_incomplete_regeneration_is_kept_as_a_partial_answer() -> None:
    evaluator = FakeEvaluator(
        assessment(False, AnswerFailureType.HALLUCINATION), partial_assessment(0.95)
    )

    async def search(query: str) -> str:
        raise AssertionError("hallucination correction uses existing evidence")

    result = await GenerationCorrector(search, evaluator, max_corrections=1).run(
        "Question", "Unsupported", "[1] Evidence"
    )

    assert not result.abstained
    assert result.answer == "Corrected, evidence-grounded answer [1]."
    assert result.trace[-1].step == "partial_answer"
    assert result.trace[-1].detail["missing_information"] == [
        "consequence of missing a class observation"
    ]


@pytest.mark.anyio
async def test_regeneration_that_is_not_faithful_still_abstains() -> None:
    evaluator = FakeEvaluator(
        assessment(False, AnswerFailureType.HALLUCINATION), partial_assessment(0.4)
    )

    async def search(query: str) -> str:
        raise AssertionError("hallucination correction uses existing evidence")

    result = await GenerationCorrector(search, evaluator, max_corrections=1).run(
        "Question", "Unsupported", "[1] Evidence"
    )

    assert result.abstained
    assert result.trace[-1].step == "abstain"


@pytest.mark.anyio
async def test_regeneration_without_citations_still_abstains() -> None:
    evaluator = FakeEvaluator(
        assessment(False, AnswerFailureType.HALLUCINATION), partial_assessment(0.95, 0.0)
    )

    async def search(query: str) -> str:
        raise AssertionError("hallucination correction uses existing evidence")

    result = await GenerationCorrector(search, evaluator, max_corrections=1).run(
        "Question", "Unsupported", "[1] Evidence"
    )

    assert result.abstained


@pytest.mark.anyio
async def test_verification_trace_lists_each_claim_with_its_verdict() -> None:
    from app.services.rag.generation.models import ClaimVerification

    graded = assessment(True)
    graded.claims = [
        ClaimVerification(claim="每节 35 元", supported=True, citation_indices=[1], reason="资料第一段"),
        ClaimVerification(claim="按月发放", supported=False, reason="资料没有提到"),
    ]
    evaluator = FakeEvaluator(graded, graded)

    async def search(query: str) -> str:
        raise AssertionError("no correction needed")

    result = await GenerationCorrector(search, evaluator, max_corrections=1).run("Q", "A [1]", "[1] E")

    claims = result.trace[0].detail["claims"]
    assert [c["supported"] for c in claims] == [True, False]
    assert claims[1]["reason"] == "资料没有提到"

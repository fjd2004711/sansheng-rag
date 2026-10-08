"""P2 graph routing tests with deterministic retriever and evidence grader fakes."""

import pytest

from app.graph.retrieval_correction import CorrectiveRetriever
from app.services.rag.correction.models import (
    CorrectionAction,
    Diagnosis,
    EvidenceAssessment,
    FailureType,
)
from app.services.rag.models import SearchResult


class QueryAwareRetriever:
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def search(self, query: str) -> list[SearchResult]:
        self.queries.append(query)
        if query == "protocol evidence":
            return [SearchResult(content="The protocol requires a signed manifest.", score=0.9)]
        return [SearchResult(content="An unrelated note.", score=0.1)]


class RewriteThenPassGrader:
    async def assess(
        self, question: str, query: str, docs: list[SearchResult]
    ) -> EvidenceAssessment:
        if query == "protocol evidence":
            return EvidenceAssessment(relevance_scores=[0.97], sufficient=True)
        return EvidenceAssessment(
            relevance_scores=[0.04],
            sufficient=False,
            missing_information=["the protocol requirement"],
            failure_type=FailureType.INSUFFICIENT_EVIDENCE,
            failure_reason="The retrieved note does not state the requirement.",
        )

    async def diagnose(
        self, question: str, query: str, assessment: EvidenceAssessment
    ) -> Diagnosis:
        return Diagnosis(
            action=CorrectionAction.REWRITE,
            rewritten_query="protocol evidence",
            missing_information=assessment.missing_information,
            failure_type=FailureType.INSUFFICIENT_EVIDENCE,
            failure_reason=assessment.failure_reason,
        )


@pytest.mark.anyio
async def test_failed_evidence_is_diagnosed_rewritten_and_then_passes() -> None:
    retriever = QueryAwareRetriever()
    result = await CorrectiveRetriever(retriever, RewriteThenPassGrader(), max_rounds=2).run(
        "What does the protocol require?"
    )

    assert retriever.queries == ["What does the protocol require?", "protocol evidence"]
    assert result.query_history == ["What does the protocol require?", "protocol evidence"]
    assert result.retrieval_round == 2
    assert not result.abstained
    assert [event.step for event in result.trace] == [
        "retrieve",
        "evidence_evaluate",
        "failure_diagnose",
        "query_rewrite",
        "retrieve",
        "evidence_evaluate",
    ]
    assert result.trace[1].status == "FAIL"
    assert result.trace[-1].status == "PASS"


class EmptyRetriever:
    async def search(self, query: str) -> list[SearchResult]:
        return []


class OutOfScopeGrader:
    async def assess(
        self, question: str, query: str, docs: list[SearchResult]
    ) -> EvidenceAssessment:
        return EvidenceAssessment(
            sufficient=False,
            failure_type=FailureType.OUT_OF_SCOPE,
            failure_reason="No indexed document addresses this question.",
        )

    async def diagnose(
        self, question: str, query: str, assessment: EvidenceAssessment
    ) -> Diagnosis:
        return Diagnosis(
            action=CorrectionAction.ABSTAIN,
            failure_type=FailureType.OUT_OF_SCOPE,
            failure_reason=assessment.failure_reason,
        )


@pytest.mark.anyio
async def test_out_of_scope_evidence_ends_in_abstention() -> None:
    result = await CorrectiveRetriever(EmptyRetriever(), OutOfScopeGrader()).run(
        "Who won the match?"
    )

    assert result.abstained
    assert result.retrieval_round == 1
    assert result.failure_type == FailureType.OUT_OF_SCOPE
    assert result.trace[-1].step == "abstain"


class AlwaysFailGrader:
    def __init__(self) -> None:
        self.rewrites = 0

    async def assess(
        self, question: str, query: str, docs: list[SearchResult]
    ) -> EvidenceAssessment:
        return EvidenceAssessment(
            relevance_scores=[0.1],
            sufficient=False,
            missing_information=["specific evidence"],
            failure_type=FailureType.INSUFFICIENT_EVIDENCE,
            failure_reason="Evidence remains incomplete.",
        )

    async def diagnose(
        self, question: str, query: str, assessment: EvidenceAssessment
    ) -> Diagnosis:
        self.rewrites += 1
        return Diagnosis(
            action=CorrectionAction.REWRITE,
            rewritten_query=f"refined query {self.rewrites}",
            failure_type=FailureType.INSUFFICIENT_EVIDENCE,
            failure_reason=assessment.failure_reason,
        )


@pytest.mark.anyio
async def test_maximum_correction_rounds_stops_the_loop() -> None:
    retriever = QueryAwareRetriever()
    result = await CorrectiveRetriever(retriever, AlwaysFailGrader(), max_rounds=2).run("Question")

    assert result.retrieval_round == 2
    assert retriever.queries == ["Question", "refined query 1"]
    assert not result.abstained
    assert result.trace[-1].step == "max_rounds_reached"
    assert result.trace[-1].detail["max_rounds"] == 2


def test_summarize_results_reports_source_snippet_and_stage_scores() -> None:
    from app.graph.retrieval_correction import summarize_results
    from app.services.rag.models import SearchResult

    doc = SearchResult(
        content="  事假应提前两个工作日\n向教务处提出申请。" + "长" * 300,
        score=0.5,
        metadata={
            "filename": "school-leave.md",
            "page_num": 1,
            "chunk_num": 0,
            "dense_score": 0.81234567,
            "bm25_score": 12.0,
            "ignored": "x",
        },
    )

    [item] = summarize_results([doc])

    assert item["source"] == "school-leave.md"
    assert item["page"] == 1 and item["chunk"] == 0
    assert str(item["snippet"]).startswith("事假应提前两个工作日 向教务处")
    assert len(str(item["snippet"])) == 160
    assert item["scores"] == {"dense_score": 0.8123, "bm25_score": 12.0}


def test_summarize_results_is_bounded() -> None:
    from app.graph.retrieval_correction import summarize_results
    from app.services.rag.models import SearchResult

    docs = [SearchResult(content=str(i), score=1.0) for i in range(25)]
    assert len(summarize_results(docs)) == 10


def test_clean_query_keeps_short_phrases_and_drops_trailing_reasoning() -> None:
    from app.services.rag.correction.evaluator import clean_query

    assert clean_query("退休金 发放标准", "学校的退休金每月发多少？") == "退休金 发放标准"
    assert clean_query("退休金 发放标准\n因为证据里没有提到", "q") == "退休金 发放标准"
    long = "知识库内容概览 " + "证据中没有关于知识库内容概览的主题和范围的信息，" * 5
    assert len(clean_query(long, "q")) <= 60


def test_clean_query_falls_back_to_the_question_when_empty() -> None:
    from app.services.rag.correction.evaluator import clean_query

    assert clean_query("", "学校的退休金每月发多少？") == "学校的退休金每月发多少？ 具体规定"
    assert clean_query("   ", "q") == "q 具体规定"

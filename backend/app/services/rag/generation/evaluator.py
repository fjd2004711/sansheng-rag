"""Structured answer verification and corrective generation for P3."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.core.clock import today_zh
from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response
from app.services.rag.correction.evaluator import clean_query
from app.services.rag.generation.models import (
    AnswerAssessment,
    AnswerDiagnosis,
    AnswerFailureType,
    ClaimVerification,
)
from app.services.rag.guard import UNTRUSTED_NOTE

_ABSTAIN_MESSAGE = "知识库中没有找到足以回答该问题的证据。"
_DATE_RULE = (
    "When a conclusion depends on dates or deadlines, first write out the exact interval from today "
    "to the target date, then compare it with the required lead time: an interval LONGER than the "
    "required lead time means the deadline has NOT been missed yet."
)


class AnswerEvaluator:
    """Use isolated provider calls so evaluation control data never reaches the answer stream."""

    def __init__(
        self, *, corpus: str = "the knowledge base", abstain_message: str = _ABSTAIN_MESSAGE
    ) -> None:
        # ``corpus`` names where the evidence came from in prompts, e.g. "the web search results".
        self._corpus = corpus
        self._abstain_message = abstain_message
        llm = current_llm()
        self._client = AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key)
        self._model = llm.model
        self._extra_body = llm.extra_body

    async def assess(self, question: str, answer: str, evidence: str) -> AnswerAssessment:
        if not _has_evidence(evidence):
            return AnswerAssessment(
                groundedness=0,
                completeness=0,
                answer_relevance=1 if answer else 0,
                citation_coverage=0,
                sufficient=False,
                failure_type=AnswerFailureType.OUT_OF_SCOPE,
                failure_reason="没有可用于核对的资料，无法确认回答是否有依据。",
            )
        prompt = (
            "Verify a RAG answer against only the supplied evidence. Return only JSON with keys "
            "groundedness, completeness, answer_relevance, citation_coverage (all 0..1), "
            "sufficient (boolean), failure_type (hallucination|insufficient_evidence|incomplete|"
            "out_of_scope|null), failure_reason, missing_information (string array), claims "
            "(array of {claim, supported, citation_indices, reason}). "
            "Write failure_reason and every missing_information item in Chinese, as plain sentences a non-technical reader understands (say what is missing or wrong, not internal terms). Write each claim and its reason in Chinese too. A claim without support or "
            "a matching inline [n] citation is not fully grounded. Use out_of_scope only when "
            f"{self._corpus} is unlikely to contain the needed answer. A claim that only applies "
            "the evidence to the question (arithmetic, comparing dates, deciding whether a stated "
            "rule is met) is supported when the reasoning is correct given today's date. An answer "
            "that is faithful to the evidence but openly says some part is not covered by the "
            f"{self._corpus} is grounded; mark it incomplete, not hallucination. Independently recompute "
            "any date or deadline conclusion from today's date; if the answer's conclusion contradicts "
            "your own computation, mark it hallucination.\n"
            f"Today's date: {today_zh()}\nQuestion: {question}\nAnswer: {answer}\nEvidence:\n{evidence[:9000]}"
        )
        parsed = _json_object(await self._complete(prompt))
        if parsed:
            try:
                return AnswerAssessment.model_validate(parsed)
            except Exception:
                pass
        return _fallback_assessment(question, answer, evidence)

    async def diagnose(self, question: str, assessment: AnswerAssessment) -> AnswerDiagnosis:
        prompt = (
            "Create one focused sub-query for a RAG answer failure. Return only JSON with keys "
            "failure_type (insufficient_evidence|incomplete|out_of_scope), sub_query (string or "
            "null), failure_reason, missing_information (string array). Write failure_reason and every missing_information item in Chinese, as plain sentences a non-technical reader understands (say what is missing or wrong, not internal terms). Use out_of_scope only "
            "when no indexed answer is likely.\n"
            f"Question: {question}\nAssessment: {assessment.model_dump_json()}"
        )
        parsed = _json_object(await self._complete(prompt))
        if parsed:
            try:
                diagnosis = AnswerDiagnosis.model_validate(parsed)
                if diagnosis.failure_type == AnswerFailureType.OUT_OF_SCOPE:
                    return diagnosis
                if diagnosis.sub_query:
                    return diagnosis
            except Exception:
                pass
        if assessment.failure_type == AnswerFailureType.OUT_OF_SCOPE:
            return AnswerDiagnosis(
                failure_type=AnswerFailureType.OUT_OF_SCOPE,
                failure_reason=assessment.failure_reason,
                missing_information=assessment.missing_information,
            )
        return AnswerDiagnosis(
            failure_type=assessment.failure_type or AnswerFailureType.INSUFFICIENT_EVIDENCE,
            sub_query=clean_query("", question),
            failure_reason=assessment.failure_reason,
            missing_information=assessment.missing_information,
        )

    async def regenerate(self, question: str, evidence: str) -> str:
        prompt = (
            "Answer the question using only the numbered RAG evidence below. Every factual claim "
            "needs an inline citation like [1]. Do not invent facts, sources, or citation numbers. "
            "Answer every part the evidence supports; for a part it does not cover, say plainly "
            f"that {self._corpus} has no information about that part, instead of guessing. "
            f"Only if the evidence contains nothing relevant, reply exactly: {self._abstain_message}\n"
            "Reply in the language of the question. Use today's date for relative times. "
            f"{_DATE_RULE}\n"
            f"Today's date: {today_zh()}\nQuestion: {question}\nEvidence:\n{evidence[:9000]}"
        )
        answer = (await self._complete(prompt)).strip()
        return answer or self._abstain_message

    async def _complete(self, prompt: str) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": UNTRUSTED_NOTE},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            extra_body=self._extra_body,
        )
        record_openai_response(response)
        return response.choices[0].message.content or ""


def _has_evidence(evidence: str) -> bool:
    return (
        bool(evidence.strip())
        and "KNOWLEDGE_BASE_ABSTAIN" not in evidence
        and not evidence.startswith("No relevant documents")
    )


def _json_object(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _terms(text: str) -> set[str]:
    """Tokenize Latin identifiers and individual CJK characters for a safe fallback."""
    return set(re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", text.lower()))


def _fallback_assessment(question: str, answer: str, evidence: str) -> AnswerAssessment:
    answer_terms = _terms(answer)
    evidence_terms = _terms(evidence)
    question_terms = _terms(question)
    coverage = len(answer_terms & evidence_terms) / max(len(answer_terms), 1)
    relevance = len(answer_terms & question_terms) / max(len(question_terms), 1)
    citations = [int(value) for value in re.findall(r"\[(\d+)\]", answer)]
    citation_coverage = 1.0 if citations else 0.0
    sufficient = coverage >= 0.55 and relevance >= 0.3 and citation_coverage == 1.0
    failure_type = (
        None
        if sufficient
        else (
            AnswerFailureType.INCOMPLETE
            if coverage >= 0.55 and citation_coverage == 1.0
            else AnswerFailureType.HALLUCINATION
        )
    )
    return AnswerAssessment(
        groundedness=coverage,
        completeness=coverage,
        answer_relevance=relevance,
        citation_coverage=citation_coverage,
        sufficient=sufficient,
        failure_type=failure_type,
        failure_reason="" if sufficient else "回答中的部分说法在资料里找不到对应的依据。",
        claims=[
            ClaimVerification(
                claim=answer[:300],
                supported=sufficient,
                citation_indices=citations,
                reason="Lexical fallback used because structured answer assessment was unavailable.",
            )
        ]
        if answer
        else [],
    )

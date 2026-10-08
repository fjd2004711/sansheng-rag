"""Structured answer verification and corrective generation for P3."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.rag.generation.models import (
    AnswerAssessment,
    AnswerDiagnosis,
    AnswerFailureType,
    ClaimVerification,
)

_ABSTAIN_MESSAGE = "知识库中没有找到足以回答该问题的证据。"


class AnswerEvaluator:
    """Use isolated provider calls so evaluation control data never reaches the answer stream."""

    def __init__(self) -> None:
        self._client = AsyncOpenAI(
            base_url=settings.OPENAI_BASE_URL,
            api_key=settings.OPENAI_API_KEY,
        )
        self._model = settings.AI_MODEL

    async def assess(self, question: str, answer: str, evidence: str) -> AnswerAssessment:
        if not _has_evidence(evidence):
            return AnswerAssessment(
                groundedness=0,
                completeness=0,
                answer_relevance=1 if answer else 0,
                citation_coverage=0,
                sufficient=False,
                failure_type=AnswerFailureType.OUT_OF_SCOPE,
                failure_reason="No usable knowledge-base evidence was available for verification.",
            )
        prompt = (
            "Verify a RAG answer against only the supplied evidence. Return only JSON with keys "
            "groundedness, completeness, answer_relevance, citation_coverage (all 0..1), "
            "sufficient (boolean), failure_type (hallucination|insufficient_evidence|incomplete|"
            "out_of_scope|null), failure_reason, missing_information (string array), claims "
            "(array of {claim, supported, citation_indices, reason}). A claim without support or "
            "a matching inline [n] citation is not fully grounded. Use out_of_scope only when "
            "the knowledge base is unlikely to contain the needed answer.\n"
            f"Question: {question}\nAnswer: {answer}\nEvidence:\n{evidence[:9000]}"
        )
        parsed = _json_object(await self._complete(prompt))
        if parsed:
            try:
                return AnswerAssessment.model_validate(parsed)
            except Exception:
                pass
        return _fallback_assessment(question, answer, evidence)

    async def diagnose(
        self, question: str, assessment: AnswerAssessment
    ) -> AnswerDiagnosis:
        prompt = (
            "Create one focused sub-query for a RAG answer failure. Return only JSON with keys "
            "failure_type (insufficient_evidence|incomplete|out_of_scope), sub_query (string or "
            "null), failure_reason, missing_information (string array). Use out_of_scope only "
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
            sub_query=f"{question} {' '.join(assessment.missing_information)}".strip(),
            failure_reason=assessment.failure_reason,
            missing_information=assessment.missing_information,
        )

    async def regenerate(self, question: str, evidence: str) -> str:
        prompt = (
            "Answer the question using only the numbered RAG evidence below. Every factual claim "
            "needs an inline citation like [1]. Do not invent facts, sources, or citation numbers. "
            f"If the evidence is insufficient, reply exactly: {_ABSTAIN_MESSAGE}\n"
            f"Question: {question}\nEvidence:\n{evidence[:9000]}"
        )
        answer = (await self._complete(prompt)).strip()
        return answer or _ABSTAIN_MESSAGE

    async def _complete(self, prompt: str) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        return response.choices[0].message.content or ""


def _has_evidence(evidence: str) -> bool:
    return bool(evidence.strip()) and "KNOWLEDGE_BASE_ABSTAIN" not in evidence and not evidence.startswith(
        "No relevant documents"
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
        failure_reason="" if sufficient else "The answer could not be fully verified against cited evidence.",
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

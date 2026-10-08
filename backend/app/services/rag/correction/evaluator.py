"""Structured evidence grading and failure diagnosis for P2."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.rag.correction.models import (
    CorrectionAction,
    Diagnosis,
    EvidenceAssessment,
    FailureType,
)
from app.services.rag.models import SearchResult


class EvidenceEvaluator:
    """Use an isolated provider call so control JSON never enters Agent streaming."""

    def __init__(self) -> None:
        self._client = AsyncOpenAI(
            base_url=settings.OPENAI_BASE_URL,
            api_key=settings.OPENAI_API_KEY,
        )
        self._model = settings.AI_MODEL

    async def assess(
        self, question: str, query: str, docs: list[SearchResult]
    ) -> EvidenceAssessment:
        if not docs:
            return EvidenceAssessment(
                sufficient=False,
                failure_type=FailureType.OUT_OF_SCOPE,
                failure_reason="资料库里没有检索到任何相关资料。",
            )
        payload = [
            {"id": index, "text": doc.content[:1200], "source": doc.metadata.get("filename")}
            for index, doc in enumerate(docs)
        ]
        prompt = (
            "Assess whether the evidence can answer the question. Judge by meaning, not exact wording: "
            "evidence is sufficient when it states the facts the answer needs, even if phrased "
            "differently from the question, and even if the question also needs simple arithmetic or "
            "a date comparison on top of those facts. Mark it insufficient only when a needed fact "
            "is truly absent. Return only JSON with "
            'keys relevance_scores (0..1 array), sufficient (boolean), missing_information '
            '(string array), failure_type (insufficient_evidence|ambiguous_query|out_of_scope|'
            'irrelevant_evidence|null), failure_reason (string). '
            'Write failure_reason and every missing_information item in Chinese, as plain sentences a non-technical reader understands (say what is missing or wrong, not internal terms). \n'
            f"Question: {question}\nQuery: {query}\nEvidence: {json.dumps(payload, ensure_ascii=False)}"
        )
        parsed = _json_object(await self._complete(prompt))
        if parsed:
            try:
                return EvidenceAssessment.model_validate(parsed)
            except Exception:
                pass
        return _fallback_assessment(question, docs)

    async def diagnose(
        self,
        question: str,
        query: str,
        assessment: EvidenceAssessment,
    ) -> Diagnosis:
        prompt = (
            "Diagnose an evidence retrieval failure. Return only JSON with keys action "
            '(rewrite|expand|abstain), rewritten_query (string or null), missing_information '
            '(string array), failure_type (insufficient_evidence|ambiguous_query|out_of_scope|'
            'irrelevant_evidence), failure_reason (string). '
            'Write failure_reason and every missing_information item in Chinese, as plain sentences a non-technical reader understands (say what is missing or wrong, not internal terms). Prefer abstain only when the '
            "knowledge base is unlikely to contain the answer.\n"
            f"Question: {question}\nCurrent query: {query}\nAssessment: {assessment.model_dump_json()}"
        )
        parsed = _json_object(await self._complete(prompt))
        if parsed:
            try:
                diagnosis = Diagnosis.model_validate(parsed)
                if diagnosis.action == CorrectionAction.ABSTAIN:
                    if diagnosis.failure_type == FailureType.OUT_OF_SCOPE:
                        return diagnosis
                    # A failed retrieval is not enough evidence that the corpus lacks an answer.
                    # P2 must try a bounded corrective search before refusing to answer.
                    return Diagnosis(
                        action=CorrectionAction.REWRITE,
                        rewritten_query=(
                            diagnosis.rewritten_query
                            or f"{question} {' '.join(assessment.missing_information)}"
                        ).strip(),
                        missing_information=(
                            diagnosis.missing_information or assessment.missing_information
                        ),
                        failure_type=diagnosis.failure_type,
                        failure_reason=diagnosis.failure_reason,
                    )
                if diagnosis.rewritten_query:
                    return diagnosis
            except Exception:
                pass
        if assessment.failure_type == FailureType.OUT_OF_SCOPE:
            return Diagnosis(
                action=CorrectionAction.ABSTAIN,
                failure_type=FailureType.OUT_OF_SCOPE,
                failure_reason=assessment.failure_reason,
                missing_information=assessment.missing_information,
            )
        return Diagnosis(
            action=CorrectionAction.REWRITE,
            rewritten_query=f"{question} {', '.join(assessment.missing_information)}".strip(),
            failure_type=assessment.failure_type or FailureType.INSUFFICIENT_EVIDENCE,
            failure_reason=assessment.failure_reason or "找到的资料不足以回答这个问题。",
            missing_information=assessment.missing_information,
        )

    async def _complete(self, prompt: str) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            extra_body=settings.llm_extra_body,
        )
        return response.choices[0].message.content or ""


def _json_object(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _fallback_assessment(question: str, docs: list[SearchResult]) -> EvidenceAssessment:
    terms = {term.lower() for term in re.findall(r"[A-Za-z0-9_]+", question) if len(term) > 2}
    scores = [
        len(terms.intersection(re.findall(r"[a-z0-9_]+", doc.content.lower()))) / max(len(terms), 1)
        for doc in docs
    ]
    sufficient = max(scores, default=0.0) >= 0.2
    return EvidenceAssessment(
        relevance_scores=scores,
        sufficient=sufficient,
        missing_information=[] if sufficient else ["与问题更直接相关的资料"],
        failure_type=None if sufficient else FailureType.INSUFFICIENT_EVIDENCE,
        failure_reason="" if sufficient else "检索到的资料与问题几乎没有共同的关键词。",
    )

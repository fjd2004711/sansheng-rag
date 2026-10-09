"""What users asked that the knowledge base could not answer, and which documents do the work."""

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import insights_repo
from app.schemas.insights import Insights, MissedQuestion, SourceUsage

MAX_ANSWERS = 500
MAX_MISSES = 50


def classify(trace: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    """('abstained' | 'partial' | None, plain-language reason) from one answer's trace."""
    kind: str | None = None
    for event in trace:
        if event.get("step") == "abstain":
            kind = "abstained"
        elif event.get("step") == "partial_answer" and kind != "abstained":
            kind = "partial"
    if kind is None:
        return None, None
    reason = None
    for event in reversed(trace):
        detail = event.get("detail") or {}
        reason = detail.get("failure_reason") or detail.get("reason")
        if reason:
            break
    return kind, reason


def retrieved_sources(trace: list[dict[str, Any]]) -> set[str]:
    found: set[str] = set()
    for event in trace:
        if event.get("step") not in ("retrieve", "retrieve_missing"):
            continue
        for item in (event.get("detail") or {}).get("results") or []:
            if isinstance(item, dict) and isinstance(item.get("source"), str):
                found.add(item["source"])
    return found


class InsightsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def overview(self, *, days: int, library_files: list[str]) -> Insights:
        since = datetime.now(UTC) - timedelta(days=days)
        answers = await insights_repo.recent_traced_answers(self.db, since=since, limit=MAX_ANSWERS)
        usage: Counter[str] = Counter()
        misses: list[MissedQuestion] = []
        abstained = partial = 0
        for message, email in answers:
            trace = message.agent_trace or []
            usage.update(retrieved_sources(trace))
            kind, reason = classify(trace)
            if kind is None:
                continue
            abstained += kind == "abstained"
            partial += kind == "partial"
            if len(misses) < MAX_MISSES:
                question = await insights_repo.question_asked_before(
                    self.db, conversation_id=message.conversation_id, before=message.created_at
                )
                misses.append(
                    MissedQuestion(
                        message_id=str(message.id),
                        question=question or "",
                        kind=kind,  # type: ignore[arg-type]
                        reason=reason,
                        user_email=email,
                        created_at=message.created_at,
                    )
                )
        return Insights(
            days=days,
            answers_analysed=len(answers),
            abstained=abstained,
            partial=partial,
            misses=misses,
            top_sources=[SourceUsage(source=s, answers=n) for s, n in usage.most_common(10)],
            never_retrieved=sorted(set(library_files) - set(usage)),
        )

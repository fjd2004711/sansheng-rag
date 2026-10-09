"""Answer quality measured from what users actually asked: derived only from stored traces and feedback."""

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import insights_repo
from app.schemas.quality import AttentionAnswer, Quality, QualityDay
from app.services.insights import classify

MAX_ANSWERS = 1000
MAX_ATTENTION = 10
CORRECTION_STEPS = {"query_rewrite", "regenerate", "retrieve_missing"}


def derive_verdict(trace: list[dict[str, Any]]) -> str:
    """Same rule as the UI's answer verdict, so numbers here match the badge users see."""
    steps = {e.get("step") for e in trace}
    verifications = [e for e in trace if e.get("step") in ("answer_verify", "answer_reverify")]
    last = verifications[-1] if verifications else None
    if "partial_answer" in steps:
        return "partial"
    if "abstain" in steps:
        return "abstained"
    if last and last.get("status") == "PASS":
        return "corrected" if steps & CORRECTION_STEPS else "verified"
    return "unchecked"


def last_assessment(trace: list[dict[str, Any]]) -> dict[str, Any]:
    for event in reversed(trace):
        if event.get("step") in ("answer_verify", "answer_reverify"):
            return event.get("detail") or {}
    return {}


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(fraction * len(ordered)))], 1)


class QualityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def overview(
        self, *, days: int, user_id: UUID | None, scope: Literal["mine", "all"]
    ) -> Quality:
        since = datetime.now(UTC) - timedelta(days=days)
        rows = await insights_repo.recent_traced_answers(
            self.db, since=since, limit=MAX_ANSWERS, user_id=user_id
        )
        ids = [message.id for message, _ in rows]
        ratings = await insights_repo.ratings_for(self.db, ids)
        tokens = await insights_repo.tokens_for(self.db, ids)

        verdicts: Counter[str] = Counter()
        failure_types: Counter[str] = Counter()
        grounded: list[float] = []
        complete: list[float] = []
        cited: list[float] = []
        searches: list[float] = []
        latency: list[float] = []
        token_counts: list[int] = []
        corrected_count = 0
        per_day: dict[str, list[tuple[bool, float | None]]] = defaultdict(list)
        attention: list[tuple[float, AttentionAnswer]] = []

        for message, _email in rows:
            trace = message.agent_trace or []
            verdict = derive_verdict(trace)
            verdicts[verdict] += 1
            detail = last_assessment(trace)
            g = detail.get("groundedness")
            if isinstance(g, (int, float)):
                grounded.append(float(g))
            for key, bucket in (("completeness", complete), ("citation_coverage", cited)):
                value = detail.get(key)
                if isinstance(value, (int, float)):
                    bucket.append(float(value))
            searches.append(
                sum(1 for e in trace if e.get("step") in ("retrieve", "retrieve_missing"))
            )
            at = trace[-1].get("at_ms") if trace else None
            if isinstance(at, (int, float)):
                latency.append(at / 1000)
            if message.id in tokens:
                token_counts.append(tokens[message.id])
            if any(e.get("step") in CORRECTION_STEPS for e in trace):
                corrected_count += 1
            for event in trace:
                ft = (event.get("detail") or {}).get("failure_type")
                if (
                    isinstance(ft, str)
                    and event.get("step")
                    in ("evidence_evaluate", "answer_verify", "answer_reverify")
                    and event.get("status") != "PASS"
                ):
                    failure_types[ft] += 1
            day = message.created_at.astimezone(UTC).date().isoformat()
            per_day[day].append(
                (
                    verdict in ("verified", "corrected"),
                    float(g) if isinstance(g, (int, float)) else None,
                )
            )

            rating = ratings.get(message.id)
            bad = (
                verdict in ("abstained", "partial", "unchecked")
                or rating == -1
                or (isinstance(g, (int, float)) and g < 0.7)
            )
            if bad and len(attention) < 200:
                _kind, reason = classify(trace)
                question = await insights_repo.question_asked_before(
                    self.db, conversation_id=message.conversation_id, before=message.created_at
                )
                severity = (0.0 if rating == -1 else 1.0) + (
                    float(g) if isinstance(g, (int, float)) else 0.5
                )
                attention.append(
                    (
                        severity,
                        AttentionAnswer(
                            message_id=str(message.id),
                            conversation_id=str(message.conversation_id),
                            question=question or "",
                            verdict=verdict,  # type: ignore[arg-type]
                            groundedness=float(g) if isinstance(g, (int, float)) else None,
                            reason=reason or detail.get("failure_reason") or None,
                            rating=rating,
                            created_at=message.created_at,
                        ),
                    )
                )

        total = len(rows)
        rated = [r for r in ratings.values() if r != 0]
        return Quality(
            days=days,
            scope=scope,
            answers=total,
            verdicts=dict(verdicts),
            avg_groundedness=_mean(grounded),
            avg_completeness=_mean(complete),
            avg_citation_coverage=_mean(cited),
            correction_rate=round(corrected_count / total, 4) if total else None,
            avg_searches=_mean(searches),
            latency_p50_s=percentile(latency, 0.5),
            latency_p90_s=percentile(latency, 0.9),
            avg_tokens=int(sum(token_counts) / len(token_counts)) if token_counts else None,
            rated=len(rated),
            helpful=sum(1 for r in rated if r > 0),
            failure_types=dict(failure_types),
            by_day=[
                QualityDay(
                    day=day,
                    answers=len(items),
                    passed=sum(1 for ok, _ in items if ok),
                    avg_groundedness=_mean([g for _, g in items if g is not None]),
                )
                for day, items in sorted(per_day.items())
            ],
            attention=[a for _, a in sorted(attention, key=lambda pair: pair[0])[:MAX_ATTENTION]],
        )

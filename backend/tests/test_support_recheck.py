"""The independent support re-check prunes sources that only look like support."""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.research import audit
from app.services.research.audit import ExtractedClaim, recheck_support
from app.services.research.credibility import source_tier
from app.services.research.models import WebSource


def _src(index: int, url: str) -> WebSource:
    return WebSource(
        index=index, title=f"s{index}", url=url, domain=url, content=f"passage {index}",
        fetched_at="", published_at="2026-09-01", from_snippet=False, tier=source_tier(url),
    )  # fmt: skip


SOURCES = [_src(1, "https://www.who.int/a"), _src(2, "https://www.example-news.com/b")]


def _claim(**kw: Any) -> ExtractedClaim:
    return ExtractedClaim(claim="44% of adults have it controlled", supporting=[1, 2], **kw)


@pytest.mark.anyio
async def test_a_source_the_recheck_rejects_stops_counting_as_support() -> None:
    with patch.object(audit, "_entailing_sources", AsyncMock(return_value={2})):
        [out] = await recheck_support([_claim()], SOURCES, enabled=True)
    assert out.supporting == [2]
    assert out.contradicting == []  # dropped, not turned into a dispute
    assert "复核" in out.note


@pytest.mark.anyio
async def test_when_every_source_is_rejected_the_claim_has_no_support() -> None:
    with patch.object(audit, "_entailing_sources", AsyncMock(return_value=set())):
        [out] = await recheck_support([_claim()], SOURCES, enabled=True)
    assert out.supporting == []


@pytest.mark.anyio
async def test_a_failed_or_unreadable_recheck_keeps_the_original_judgement() -> None:
    for outcome in (AsyncMock(side_effect=RuntimeError("down")), AsyncMock(return_value=None)):
        with patch.object(audit, "_entailing_sources", outcome):
            [out] = await recheck_support([_claim()], SOURCES, enabled=True)
        assert out.supporting == [1, 2]


@pytest.mark.anyio
async def test_disabled_recheck_makes_no_model_call() -> None:
    mock = AsyncMock()
    with patch.object(audit, "_entailing_sources", mock):
        [out] = await recheck_support([_claim()], SOURCES, enabled=False)
    assert out.supporting == [1, 2]
    mock.assert_not_called()


@pytest.mark.anyio
async def test_claims_without_support_are_not_sent_to_the_model() -> None:
    mock = AsyncMock()
    with patch.object(audit, "_entailing_sources", mock):
        await recheck_support([ExtractedClaim(claim="x")], SOURCES, enabled=True)
    mock.assert_not_called()

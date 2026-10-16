"""Data passed between the research-mode steps."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WebHit(BaseModel):
    """One result from the search provider, before the page is fetched."""

    title: str
    url: str
    snippet: str = ""
    site_name: str = ""
    published_at: str | None = None


class WebPage(BaseModel):
    """Readable text of a fetched page. ``from_snippet`` when only the search snippet was usable."""

    url: str
    title: str
    domain: str
    text: str
    fetched_at: str
    published_at: str | None = None
    from_snippet: bool = False


class WebSource(BaseModel):
    """A numbered passage the answer may cite as ``[index]``."""

    index: int
    title: str
    url: str
    domain: str
    content: str
    fetched_at: str
    published_at: str | None = None
    from_snippet: bool = False
    tier: str = "general"  # credibility.Tier
    score: float = 0.0
    component_scores: dict[str, float] = Field(default_factory=dict)


class ResearchResult(BaseModel):
    answer: str
    queries: list[str]
    sources: list[WebSource]
    evidence: str
    abstained: bool = False

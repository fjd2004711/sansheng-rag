"""Fetch real pages with the production fetcher and freeze them as snapshots for the real-page gold set.

Usage (from backend/): uv run python ../eval/verification/fetch_snapshots.py [--force]
Reads real/urls.jsonl, writes real/snapshots/<id>.json. Existing snapshots are kept so the gold labels stay
tied to the exact text that was annotated; pass --force to refetch.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.services.research import fetcher as fetcher_module
from app.services.research.fetcher import PageFetcher
from app.services.research.models import WebHit

REAL = Path(__file__).parent / "real"


async def _allow_all(url: str) -> None:
    """The URL list is ours; a local fake-IP proxy resolves public hosts to private addresses."""


fetcher_module.assert_public_url = _allow_all


async def main(force: bool) -> None:
    out = REAL / "snapshots"
    out.mkdir(exist_ok=True)
    fetcher = PageFetcher(timeout=25.0, max_bytes=6_000_000)
    for line in (REAL / "urls.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        path = out / f"{entry['id']}.json"
        if path.exists() and not force:
            continue
        page = await fetcher.fetch(WebHit(url=entry["url"], title="", snippet=""))
        path.write_text(
            json.dumps(
                {
                    "id": entry["id"],
                    "url": page.url,
                    "title": page.title,
                    "text": page.text,
                    "published_at": page.published_at,
                    "fetched_at": page.fetched_at,
                    "from_snippet": page.from_snippet,
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        print(entry["id"], len(page.text), "snippet" if page.from_snippet else "full", page.title[:40])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    asyncio.run(main(parser.parse_args().force))

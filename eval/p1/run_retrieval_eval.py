"""Run the reproducible P1 Dense vs Hybrid retrieval evaluation."""

from __future__ import annotations

import asyncio
import json
from math import log2
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.services.rag.embeddings import EmbeddingService
from app.services.rag.models import Document, DocumentMetadata, DocumentPage, DocumentPageChunk
from app.services.rag.reranker import RerankService
from app.services.rag.retrieval import RetrievalService
from app.services.rag.sparse import bm25_index
from app.services.rag.vectorstore import QdrantVectorStore

ROOT = Path(__file__).parent
COLLECTION = "p1_eval"


def read_jsonl(path: Path) -> list[dict[str, str]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def document_from_fixture(item: dict[str, str]) -> Document:
    document_id = f"p1-{item['filename']}"
    content = item["content"]
    return Document(
        id=document_id,
        pages=[DocumentPage(page_num=1, content=content, parent_doc_id=document_id)],
        chunked_pages=[
            DocumentPageChunk(
                page_num=1,
                content=content,
                chunk_content=content,
                parent_doc_id=document_id,
                chunk_id=str(uuid4()),
                chunk_num=0,
            )
        ],
        metadata=DocumentMetadata(
            filename=item["filename"],
            filesize=len(content.encode()),
            filetype="txt",
            source_path=f"eval/p1/{item['filename']}",
        ),
    )


def score(rows: list[dict[str, object]], k: int) -> dict[str, float]:
    reciprocal_ranks: list[float] = []
    ndcgs: list[float] = []
    hits = 0
    for row in rows:
        filenames = row["filenames"]
        gold = row["gold_filename"]
        rank = next((i + 1 for i, value in enumerate(filenames[:k]) if value == gold), None)
        if rank is None:
            reciprocal_ranks.append(0.0)
            ndcgs.append(0.0)
        else:
            hits += 1
            reciprocal_ranks.append(1.0 / rank)
            ndcgs.append(1.0 / log2(rank + 1))
    total = len(rows)
    return {
        f"Recall@{k}": hits / total,
        f"MRR@{k}": sum(reciprocal_ranks) / total,
        f"nDCG@{k}": sum(ndcgs) / total,
    }


async def run_mode(
    name: str, store: QdrantVectorStore, cases: list[dict[str, str]], hybrid: bool, rerank: bool
) -> dict[str, object]:
    reranker_config = settings.rag.reranker_config.model_copy(update={"enabled": rerank})
    mode_settings = settings.rag.model_copy(
        update={"enable_hybrid_search": hybrid, "reranker_config": reranker_config}
    )
    service = RetrievalService(
        store,
        mode_settings,
        rerank_service=RerankService(mode_settings),
    )
    rows: list[dict[str, object]] = []
    for case in cases:
        results = await service.retrieve(case["query"], COLLECTION, limit=10)
        rows.append(
            {
                "id": case["id"],
                "query": case["query"],
                "gold_filename": case["gold_filename"],
                "filenames": [result.metadata.get("filename") for result in results],
                "score_metadata": [result.metadata for result in results],
            }
        )
    return {"name": name, "metrics": {**score(rows, 5), **score(rows, 10)}, "rows": rows}


async def main() -> None:
    corpus = read_jsonl(ROOT / "corpus.jsonl")
    cases = read_jsonl(ROOT / "golden.jsonl")
    store = QdrantVectorStore(settings.rag, EmbeddingService(settings.rag))
    try:
        try:
            await store.delete_collection(COLLECTION)
        except Exception:
            pass
        for item in corpus:
            await store.insert_document(COLLECTION, document_from_fixture(item))
        bm25_index.invalidate(COLLECTION)

        dense = await run_mode("dense", store, cases, hybrid=False, rerank=False)
        hybrid = await run_mode("hybrid_rrf", store, cases, hybrid=True, rerank=False)
        full = await run_mode("hybrid_rrf_reranked", store, cases, hybrid=True, rerank=True)
        report = {"collection": COLLECTION, "case_count": len(cases), "modes": [dense, hybrid, full]}
        (ROOT / "p1-retrieval-report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    finally:
        await store.client.close()


if __name__ == "__main__":
    asyncio.run(main())

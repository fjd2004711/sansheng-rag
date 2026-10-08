"""Live P2 gate: real Qdrant retrieval plus isolated model evidence grading."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.core.config import settings
from app.graph.retrieval_correction import CorrectiveRetriever
from app.services.rag.correction.evaluator import EvidenceEvaluator
from app.services.rag.embeddings import EmbeddingService
from app.services.rag.models import Document, DocumentMetadata, DocumentPage, DocumentPageChunk, SearchResult
from app.services.rag.retrieval import RetrievalService
from app.services.rag.vectorstore import QdrantVectorStore

COLLECTION = "p2_live_gate"
REPORT = Path("artifacts/p2-gate-report.json")


class CollectionRetriever:
    def __init__(self, service: RetrievalService) -> None:
        self.service = service

    async def search(self, query: str) -> list[SearchResult]:
        return await self.service.retrieve(query, COLLECTION, limit=1)


def document(filename: str, content: str) -> Document:
    doc_id = f"p2-{filename}"
    return Document(
        id=doc_id,
        pages=[DocumentPage(page_num=1, content=content, parent_doc_id=doc_id)],
        chunked_pages=[
            DocumentPageChunk(
                page_num=1,
                content=content,
                chunk_content=content,
                chunk_num=0,
                parent_doc_id=doc_id,
            )
        ],
        metadata=DocumentMetadata(filename=filename, filesize=len(content), filetype=".txt"),
    )


async def main() -> None:
    rag_settings = settings.rag
    store = QdrantVectorStore(rag_settings, EmbeddingService(rag_settings))
    try:
        await store.delete_collection(COLLECTION)
    except Exception:
        pass

    await store.insert_document(
        COLLECTION,
        document(
            "atlas-policy.txt",
            "Atlas protocol compliance requires the CRIMSON-SEAL credential before release.",
        ),
    )
    await store.insert_document(
        COLLECTION,
        document(
            "deployment-calendar.txt",
            "The deployment schedule has milestones on Monday, Wednesday, and Friday.",
        ),
    )
    service = RetrievalService(store, rag_settings)
    graph = CorrectiveRetriever(
        CollectionRetriever(service), EvidenceEvaluator(), max_rounds=2
    )

    correction = await graph.run(
        "What credential does Atlas protocol compliance require?",
        initial_query="deployment schedule milestones",
    )
    abstention = await graph.run("Which planet won the interstellar league?")

    report = {
        "correction": correction.model_dump(mode="json"),
        "abstention": abstention.model_dump(mode="json"),
        "pass": {
            "q0_fail_q1_pass": (
                correction.retrieval_round == 2
                and correction.query_history[0] != correction.query_history[-1]
                and any(event.status == "FAIL" for event in correction.trace)
                and correction.trace[-1].status == "PASS"
            ),
            "out_of_scope_abstain": abstention.abstained,
            "bounded": correction.retrieval_round <= 2 and abstention.retrieval_round <= 2,
        },
    }
    report["all_pass"] = all(report["pass"].values())
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["pass"], ensure_ascii=False))
    if not report["all_pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())

"""Admin view of what the knowledge base fails to answer."""

from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdmin, InsightsSvc, RAGDocumentSvc
from app.core.config import settings
from app.schemas.insights import Insights

router = APIRouter()


@router.get("/insights", response_model=Insights)
async def knowledge_gaps(
    service: InsightsSvc,
    rag_doc_svc: RAGDocumentSvc,
    _: CurrentAdmin,
    days: int = Query(30, ge=1, le=365),
) -> Any:
    """Unanswered / partly answered questions, most-used documents, and documents never retrieved."""
    shared = await rag_doc_svc.list_documents(settings.rag.collection_name)
    files = [d.filename for d in shared.items if d.status == "done"]
    return await service.overview(days=days, library_files=files)

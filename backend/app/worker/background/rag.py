"""In-process RAG ingestion handler (FastAPI BackgroundTasks fallback).

Performs a single document ingestion in the API process and updates its
``RAGDocument`` tracking record on completion.
"""

import logging
from pathlib import Path

from app.db.session import get_db_context
from app.services.rag.ingestion import IngestionService
from app.services.rag.models import IngestionResult, IngestionStatus

logger = logging.getLogger(__name__)

NO_TEXT_MESSAGE = "没有从文件中提取到文字：可能是扫描件或纯图片 PDF，请上传带文字层的版本"


def _failure_message(result: IngestionResult) -> str:
    """What the library page shows for a failed file."""
    error = result.error_message or result.message or "入库失败"
    return NO_TEXT_MESSAGE if "no chunked pages" in error else error


async def ingest_document_in_background(
    *,
    rag_document_id: str,
    collection_name: str,
    filepath: str,
    source_path: str,
    replace: bool,
) -> None:
    """Ingest a single document into the vector store and update its DB record."""
    from app.services.rag_document import RAGDocumentService

    try:
        result = await IngestionService.from_settings().ingest_file(
            filepath=Path(filepath),
            collection_name=collection_name,
            replace=replace,
            source_path=source_path,
        )
        if result.status != IngestionStatus.DONE:
            # ingest_file reports failures as a result instead of raising; never record them as done.
            async with get_db_context() as db:
                await RAGDocumentService(db).fail_ingestion(
                    rag_document_id, error_message=_failure_message(result)
                )
            return
        async with get_db_context() as db:
            await RAGDocumentService(db).complete_ingestion(
                rag_document_id,
                vector_document_id=result.document_id,
                chunk_count=result.chunk_count,
            )
    except Exception as exc:
        logger.error("background_ingestion_failed: %s", exc)
        async with get_db_context() as db:
            await RAGDocumentService(db).fail_ingestion(rag_document_id, error_message=str(exc))
    finally:
        Path(filepath).unlink(missing_ok=True)

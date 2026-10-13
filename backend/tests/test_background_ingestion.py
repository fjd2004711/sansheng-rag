"""The background ingestion task must record what actually happened to the file."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.rag.models import IngestionResult, IngestionStatus
from app.worker.background import rag as background


def _run_patches(result: IngestionResult) -> tuple[MagicMock, list[patch]]:
    service = MagicMock()
    service.complete_ingestion = AsyncMock()
    service.fail_ingestion = AsyncMock()
    ingestion = MagicMock()
    ingestion.ingest_file = AsyncMock(return_value=result)
    db_context = MagicMock()
    db_context.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
    db_context.return_value.__aexit__ = AsyncMock(return_value=False)
    patches = [
        patch.object(background.IngestionService, "from_settings", return_value=ingestion),
        patch.object(background, "get_db_context", db_context),
        patch("app.services.rag_document.RAGDocumentService", return_value=service),
    ]
    return service, patches


async def _ingest(tmp_path: Path, result: IngestionResult) -> MagicMock:
    service, patches = _run_patches(result)
    upload = tmp_path / "scan.pdf"
    upload.write_bytes(b"%PDF")
    for p in patches:
        p.start()
    try:
        await background.ingest_document_in_background(
            rag_document_id="doc-1",
            collection_name="documents",
            filepath=str(upload),
            source_path="scan.pdf",
            replace=False,
        )
    finally:
        for p in patches:
            p.stop()
    assert not upload.exists()
    return service


@pytest.mark.anyio
async def test_ingest_with_error_result_marks_document_failed(tmp_path: Path) -> None:
    result = IngestionResult(
        status=IngestionStatus.ERROR, error_message="Document has no chunked pages."
    )
    service = await _ingest(tmp_path, result)
    service.complete_ingestion.assert_not_awaited()
    service.fail_ingestion.assert_awaited_once_with(
        "doc-1", error_message=background.NO_TEXT_MESSAGE
    )


@pytest.mark.anyio
async def test_ingest_with_other_error_keeps_original_message(tmp_path: Path) -> None:
    result = IngestionResult(status=IngestionStatus.ERROR, error_message="embedding timeout")
    service = await _ingest(tmp_path, result)
    service.fail_ingestion.assert_awaited_once_with("doc-1", error_message="embedding timeout")


@pytest.mark.anyio
async def test_ingest_with_done_result_marks_document_done(tmp_path: Path) -> None:
    result = IngestionResult(status=IngestionStatus.DONE, document_id="vec-1", chunk_count=3)
    service = await _ingest(tmp_path, result)
    service.fail_ingestion.assert_not_awaited()
    service.complete_ingestion.assert_awaited_once_with(
        "doc-1", vector_document_id="vec-1", chunk_count=3
    )

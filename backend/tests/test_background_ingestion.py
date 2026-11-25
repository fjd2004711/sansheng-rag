"""The background ingestion task must record what actually happened to the file."""

from contextlib import ExitStack
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


@pytest.mark.anyio
async def test_retry_ingests_a_copy_with_the_original_extension(tmp_path: Path) -> None:
    result = IngestionResult(status=IngestionStatus.DONE, document_id="vec-2", chunk_count=2)
    service, patches = _run_patches(result)
    original = tmp_path / "stored-without-a-suffix"
    original.write_bytes(b"original markdown")
    attempted_files = []

    async def ingest_copy(*, filepath: Path, source_path: str, **kwargs) -> IngestionResult:
        assert source_path == "report.MD"
        assert filepath != original
        assert filepath.suffix == ".md"
        assert filepath.read_bytes() == original.read_bytes()
        attempted_files.append(filepath)
        return result

    with ExitStack() as stack:
        ingestion_factory = stack.enter_context(patches[0])
        ingestion_factory.return_value.ingest_file.side_effect = ingest_copy
        for patcher in patches[1:]:
            stack.enter_context(patcher)
        await background.ingest_document_in_background(
            rag_document_id="doc-2",
            collection_name="documents",
            filepath=str(original),
            source_path="report.MD",
            replace=False,
            use_stored_original=True,
        )

    assert original.read_bytes() == b"original markdown"
    assert len(attempted_files) == 1
    assert not attempted_files[0].exists()
    service.complete_ingestion.assert_awaited_once_with(
        "doc-2", vector_document_id="vec-2", chunk_count=2
    )


@pytest.mark.anyio
async def test_retry_records_a_copy_failure(tmp_path: Path) -> None:
    service, patches = _run_patches(IngestionResult(status=IngestionStatus.DONE))

    with ExitStack() as stack:
        ingestion_factory = stack.enter_context(patches[0])
        for patcher in patches[1:]:
            stack.enter_context(patcher)
        await background.ingest_document_in_background(
            rag_document_id="doc-2",
            collection_name="documents",
            filepath=str(tmp_path / "missing.md"),
            source_path="report.md",
            replace=False,
            use_stored_original=True,
        )

    ingestion_factory.assert_not_called()
    service.fail_ingestion.assert_awaited_once_with(
        "doc-2", error_message="无法读取原文件，请重新上传"
    )

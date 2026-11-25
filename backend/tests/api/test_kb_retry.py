from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.deps import get_current_user, get_db_session
from app.core.config import settings
from app.core.kb_scope import personal_collection
from app.db.models.rag_document import RAGDocument
from app.db.models.user import User, UserRole
from app.main import app
from app.services import rag_document

pytestmark = pytest.mark.anyio


@pytest.fixture
def retry_context(client, mock_db_session, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, "MEDIA_DIR", tmp_path)
    user = User(id=uuid4(), role=UserRole.USER.value)
    app.dependency_overrides[get_current_user] = lambda: user
    doc = RAGDocument(
        id=uuid4(),
        collection_name=personal_collection(user.id),
        filename="notes.md",
        status="error",
        storage_path="notes.md",
    )
    (tmp_path / "notes.md").write_text("saved text", encoding="utf-8")
    mock_db_session.get.return_value = doc
    mock_db_session.execute.return_value = MagicMock()
    mock_db_session.execute.return_value.scalar_one_or_none.return_value = doc.id
    worker = AsyncMock()
    monkeypatch.setattr(rag_document, "ingest_document_in_background", worker)
    return user, doc, worker


@pytest.mark.parametrize("personal", [True, False])
async def test_retry_dispatches_after_commit(
    client, mock_db_session, retry_context, tmp_path, personal
):
    user, doc, worker = retry_context
    if not personal:
        user.role = UserRole.ADMIN.value
        doc.collection_name = "shared"
    events = []

    async def session_with_commit():
        yield mock_db_session
        events.append("commit")

    app.dependency_overrides[get_db_session] = session_with_commit
    worker.side_effect = lambda **kwargs: events.append("ingest")
    prefix = "/api/v1/rag/my/documents" if personal else "/api/v1/rag/documents"

    response = await client.post(f"{prefix}/{doc.id}/retry")

    assert response.status_code == 200
    assert response.json() == {"id": str(doc.id), "status": "processing", "message": "Retry queued"}
    assert events == ["commit", "ingest"]
    mock_db_session.execute.assert_awaited_once()
    worker.assert_awaited_once_with(
        rag_document_id=str(doc.id),
        collection_name=doc.collection_name,
        filepath=str(tmp_path / "notes.md"),
        source_path="notes.md",
        replace=personal,
        use_stored_original=True,
    )


@pytest.mark.parametrize(
    ("collection", "path", "role", "status_code"),
    [
        ("other", "my/documents", UserRole.USER, 404),
        ("shared", "my/documents", UserRole.USER, 404),
        ("other", "documents", UserRole.ADMIN, 404),
        ("shared", "documents", UserRole.USER, 403),
    ],
)
async def test_retry_respects_collection_scope(
    client, mock_db_session, retry_context, collection, path, role, status_code
):
    user, doc, worker = retry_context
    user.role = role.value
    doc.collection_name = personal_collection(uuid4()) if collection == "other" else "shared"

    response = await client.post(f"/api/v1/rag/{path}/{doc.id}/retry")

    assert response.status_code == status_code
    mock_db_session.execute.assert_not_awaited()
    worker.assert_not_awaited()


@pytest.mark.parametrize("status", ["processing", "done"])
async def test_retry_rejects_non_failed_documents(client, mock_db_session, retry_context, status):
    _, doc, worker = retry_context
    doc.status = status

    response = await client.post(f"/api/v1/rag/my/documents/{doc.id}/retry")

    assert response.status_code == 400
    mock_db_session.execute.assert_not_awaited()
    worker.assert_not_awaited()


async def test_retry_with_missing_original_leaves_document_failed(
    client, mock_db_session, retry_context, tmp_path
):
    _, doc, worker = retry_context
    (tmp_path / "notes.md").unlink()

    response = await client.post(f"/api/v1/rag/my/documents/{doc.id}/retry")

    assert response.status_code == 400
    assert "original file is missing" in response.json()["error"]["message"]
    mock_db_session.execute.assert_not_awaited()
    worker.assert_not_awaited()


async def test_retry_losing_the_claim_does_not_dispatch_a_second_job(
    client, mock_db_session, retry_context
):
    _, doc, worker = retry_context
    result = mock_db_session.execute.return_value
    result.scalar_one_or_none.side_effect = [doc.id, None]
    url = f"/api/v1/rag/my/documents/{doc.id}/retry"

    assert (await client.post(url)).status_code == 200
    assert (await client.post(url)).status_code == 400
    worker.assert_awaited_once()

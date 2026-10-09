from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.agents.tools.rag_tool import _retrieve_once
from app.core.config import settings
from app.core.exceptions import AuthorizationError
from app.core.kb_scope import (
    RetrievalScope,
    authorize_collections,
    build_scope,
    is_personal_collection,
    personal_collection,
    use_scope,
)


def test_personal_collection_is_derived_from_the_user_and_valid_for_qdrant() -> None:
    uid = uuid4()
    name = personal_collection(uid)
    assert is_personal_collection(name) and name[0] == "u" and len(name) == 33
    assert not is_personal_collection("documents")


def test_other_users_private_collection_is_refused_but_own_and_shared_are_fine() -> None:
    me, other = uuid4(), uuid4()
    authorize_collections(me, ["documents", personal_collection(me)])
    with pytest.raises(AuthorizationError):
        authorize_collections(me, [personal_collection(other)])


def test_client_can_only_narrow_never_name_a_collection() -> None:
    uid = uuid4()
    shared = settings.rag.collection_name
    assert build_scope(uid, has_personal_docs=True, sources="all", filenames=None).collections == [
        shared,
        personal_collection(uid),
    ]
    assert build_scope(
        uid, has_personal_docs=True, sources="shared", filenames=None
    ).collections == [shared]
    assert build_scope(uid, has_personal_docs=True, sources="mine", filenames=None).collections == [
        personal_collection(uid)
    ]
    # Garbage input degrades to the safe default; no personal docs means no personal collection.
    assert build_scope(
        uid, has_personal_docs=False, sources="u" + "0" * 32, filenames=None
    ).collections == [shared]


def test_filenames_filter_ignores_non_strings() -> None:
    scope = build_scope(
        uuid4(), has_personal_docs=False, sources="all", filenames=["a.pdf", 3, None, ""]
    )
    assert scope.filenames == frozenset({"a.pdf"})


class FakeService:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def retrieve_multi(self, query, collection_names, limit):
        self.calls.append(collection_names)
        return [
            SimpleNamespace(content="x", score=0.9, metadata={"filename": "a.txt"}),
            SimpleNamespace(content="y", score=0.8, metadata={"filename": "b.txt"}),
        ]

    async def retrieve(self, query, collection_name, limit):
        self.calls.append([collection_name])
        return await self.retrieve_multi(query, [collection_name], limit)


@pytest.mark.anyio
async def test_bound_scope_overrides_a_requested_collection_and_filters_files() -> None:
    service = FakeService()
    with use_scope(
        RetrievalScope(collections=["documents", "uabc"], filenames=frozenset({"b.txt"}))
    ):
        results = await _retrieve_once(
            service, query="q", collection="all", collections=None, top_k=5
        )
    assert service.calls == [["documents", "uabc"]]
    assert [r.metadata["filename"] for r in results] == ["b.txt"]

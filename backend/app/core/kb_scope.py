"""Which knowledge-base collections a turn may read.

Every user has a private collection (``u`` + the user id in hex) next to the shared one. Its name is
always derived from the authenticated user id on the server; the client may only *narrow* what it
searches, never name a collection.
"""

import re
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.exceptions import AuthorizationError

_PERSONAL_RE = re.compile(r"^u[0-9a-f]{32}$")


def personal_collection(user_id: UUID | str) -> str:
    return "u" + UUID(str(user_id)).hex


def is_personal_collection(name: str) -> bool:
    return bool(_PERSONAL_RE.match(name))


def authorize_collections(user_id: UUID | str, names: list[str]) -> None:
    """Refuse any collection that is another user's private one."""
    own = personal_collection(user_id)
    for name in names:
        if is_personal_collection(name) and name != own:
            raise AuthorizationError(
                message="You cannot search another user's library", details={"collection": name}
            )


@dataclass(frozen=True)
class RetrievalScope:
    """Collections to search this turn, and optionally the only files allowed to answer."""

    collections: list[str]
    filenames: frozenset[str] = field(default_factory=frozenset)


_scope: ContextVar[RetrievalScope | None] = ContextVar("retrieval_scope", default=None)


def current_scope() -> RetrievalScope | None:
    return _scope.get()


@contextmanager
def use_scope(scope: RetrievalScope | None) -> Iterator[None]:
    token = _scope.set(scope)
    try:
        yield
    finally:
        _scope.reset(token)


def build_scope(
    user_id: UUID | str,
    *,
    has_personal_docs: bool,
    sources: str | None,
    filenames: Any = None,
) -> RetrievalScope:
    """Turn the client's narrowing request into a scope it is allowed to have."""
    shared = settings.rag.collection_name
    mine = personal_collection(user_id)
    choice = sources if sources in {"all", "shared", "mine"} else "all"
    collections: list[str] = []
    if choice in ("all", "shared"):
        collections.append(shared)
    if choice in ("all", "mine") and has_personal_docs:
        collections.append(mine)
    if (
        not collections
    ):  # "mine" with an empty library: fall back so the turn still answers honestly
        collections.append(shared if choice != "mine" else mine)
    names = (
        frozenset(str(n) for n in filenames if isinstance(n, str) and n)
        if isinstance(filenames, list)
        else frozenset()
    )
    return RetrievalScope(collections=collections, filenames=names)

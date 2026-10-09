"""Admin-adjustable RAG settings, persisted in the database and applied to the live process settings."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings
from app.db.models.app_setting import AppSetting
from app.schemas.rag_settings import RagSettings

logger = logging.getLogger(__name__)

RAG_KEY = "rag"

# Setting field -> attribute on the process-wide Settings object.
_FIELD_TO_ATTR = {
    "correction_enabled": "RAG_CORRECTION_ENABLED",
    "max_correction_rounds": "RAG_MAX_CORRECTION_ROUNDS",
    "generation_correction_enabled": "RAG_GENERATION_CORRECTION_ENABLED",
    "max_generation_corrections": "RAG_MAX_GENERATION_CORRECTIONS",
    "reranker_enabled": "RAG_RERANKER_ENABLED",
}


def read_current(target: Settings = settings) -> RagSettings:
    return RagSettings(**{field: getattr(target, attr) for field, attr in _FIELD_TO_ATTR.items()})


def apply(values: RagSettings, target: Settings = settings) -> None:
    """Make ``values`` the live configuration (single backend process)."""
    for field, attr in _FIELD_TO_ATTR.items():
        setattr(target, attr, getattr(values, field))


class AppSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_rag(self, values: RagSettings) -> RagSettings:
        row = await self.db.get(AppSetting, RAG_KEY)
        if row is None:
            self.db.add(AppSetting(key=RAG_KEY, value=values.model_dump()))
        else:
            row.value = values.model_dump()
        await self.db.flush()
        apply(values)
        return values


async def load_saved_rag(db: AsyncSession) -> None:
    """At startup: re-apply what an admin saved earlier. Missing or invalid rows are ignored."""
    row = await db.get(AppSetting, RAG_KEY)
    if row is None:
        return
    try:
        apply(RagSettings(**{**read_current().model_dump(), **row.value}))
    except Exception:
        logger.warning("saved_rag_settings_invalid", exc_info=True)

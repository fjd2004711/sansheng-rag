"""User LLM config repository (PostgreSQL async)."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user_llm_config import UserLLMConfig


async def get_by_user(db: AsyncSession, user_id: UUID) -> UserLLMConfig | None:
    result = await db.execute(select(UserLLMConfig).where(UserLLMConfig.user_id == user_id))
    return result.scalar_one_or_none()


async def upsert(
    db: AsyncSession,
    *,
    user_id: UUID,
    base_url: str,
    api_key_encrypted: str,
    model: str,
    disable_thinking: bool,
) -> UserLLMConfig:
    config = await get_by_user(db, user_id)
    if config is None:
        config = UserLLMConfig(user_id=user_id)
        db.add(config)
    config.base_url = base_url
    config.api_key_encrypted = api_key_encrypted
    config.model = model
    config.disable_thinking = disable_thinking
    await db.flush()
    await db.refresh(config)
    return config


async def delete(db: AsyncSession, user_id: UUID) -> bool:
    config = await get_by_user(db, user_id)
    if config is None:
        return False
    await db.delete(config)
    await db.flush()
    return True

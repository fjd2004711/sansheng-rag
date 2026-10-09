"""Per-user chat model configuration (bring your own OpenAI-compatible endpoint)."""

import ipaddress
import time
from urllib.parse import urlsplit
from uuid import UUID

from cryptography.fernet import InvalidToken
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_value, encrypt_value
from app.core.exceptions import BadRequestError
from app.core.llm_runtime import LLMRuntime, server_default_llm
from app.db.models.user_llm_config import UserLLMConfig
from app.repositories import user_llm_config_repo
from app.schemas.llm_config import LLMConfigRead, LLMConfigTestResult, LLMConfigUpdate

_BLOCKED_HOSTS = {"metadata.google.internal", "metadata"}
TEST_TIMEOUT_SECONDS = 20


def encrypt_secret(plain: str) -> str:
    return encrypt_value(plain, settings.SECRET_KEY)


def decrypt_secret(token: str) -> str | None:
    """The plaintext, or None when it was encrypted under a different SECRET_KEY."""
    try:
        return decrypt_value(token, settings.SECRET_KEY)
    except InvalidToken:
        return None


def _mask(key: str) -> str:
    return f"…{key[-4:]}" if len(key) >= 8 else "已设置"


def _reject_metadata_endpoints(base_url: str) -> None:
    """Private/LAN endpoints (Ollama, vLLM) are legitimate; cloud metadata endpoints are not."""
    host = (urlsplit(base_url).hostname or "").lower()
    blocked = host in _BLOCKED_HOSTS
    try:
        address = ipaddress.ip_address(host)
        blocked = blocked or address.is_link_local or address.is_unspecified
    except ValueError:
        pass
    if blocked:
        raise BadRequestError(message="不允许使用这个接口地址", details={"base_url": base_url})


class LLMConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _to_read(self, config: UserLLMConfig | None) -> LLMConfigRead:
        if config is None:
            default = server_default_llm()
            return LLMConfigRead(
                configured=False,
                source="server",
                model=default.model,
                disable_thinking=default.disable_thinking,
            )
        key = decrypt_secret(config.api_key_encrypted)
        return LLMConfigRead(
            configured=True,
            source="custom",
            base_url=config.base_url,
            model=config.model,
            disable_thinking=config.disable_thinking,
            api_key_hint=_mask(key) if key else None,
        )

    async def get(self, user_id: UUID) -> LLMConfigRead:
        return self._to_read(await user_llm_config_repo.get_by_user(self.db, user_id))

    async def _resolve_key(self, user_id: UUID, data: LLMConfigUpdate) -> str:
        if data.api_key:
            return data.api_key
        existing = await user_llm_config_repo.get_by_user(self.db, user_id)
        key = decrypt_secret(existing.api_key_encrypted) if existing else None
        if not key:
            raise BadRequestError(message="请填写 API Key")
        return key

    async def save(self, user_id: UUID, data: LLMConfigUpdate) -> LLMConfigRead:
        _reject_metadata_endpoints(data.base_url)
        key = await self._resolve_key(user_id, data)
        config = await user_llm_config_repo.upsert(
            self.db,
            user_id=user_id,
            base_url=data.base_url,
            api_key_encrypted=encrypt_secret(key),
            model=data.model.strip(),
            disable_thinking=data.disable_thinking,
        )
        return self._to_read(config)

    async def reset(self, user_id: UUID) -> LLMConfigRead:
        await user_llm_config_repo.delete(self.db, user_id)
        return self._to_read(None)

    async def test(self, user_id: UUID, data: LLMConfigUpdate) -> LLMConfigTestResult:
        """Send one tiny completion with the submitted (unsaved) settings."""
        _reject_metadata_endpoints(data.base_url)
        key = await self._resolve_key(user_id, data)
        client = AsyncOpenAI(
            base_url=data.base_url, api_key=key, timeout=TEST_TIMEOUT_SECONDS, max_retries=0
        )
        started = time.monotonic()
        try:
            await client.chat.completions.create(
                model=data.model.strip(),
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=8,
                extra_body={"enable_thinking": False} if data.disable_thinking else None,
            )
        except Exception as exc:  # provider errors are shown to the user verbatim, minus the key
            detail = str(exc).replace(key, "***")
            return LLMConfigTestResult(ok=False, message=detail[:300])
        return LLMConfigTestResult(
            ok=True, message="连接成功", latency_ms=int((time.monotonic() - started) * 1000)
        )


async def load_runtime(db: AsyncSession, user_id: UUID) -> LLMRuntime | None:
    """The user's own model as a runtime, or None to use the server default."""
    config = await user_llm_config_repo.get_by_user(db, user_id)
    if config is None:
        return None
    key = decrypt_secret(config.api_key_encrypted)
    if not key:
        return None
    return LLMRuntime(
        base_url=config.base_url,
        api_key=key,
        model=config.model,
        disable_thinking=config.disable_thinking,
        is_custom=True,
    )

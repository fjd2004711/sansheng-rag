"""Schemas for the user's own chat model configuration."""

from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema


class LLMConfigUpdate(BaseSchema):
    """``api_key`` may be omitted to keep the stored key while changing other fields."""

    base_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    model: str = Field(min_length=1, max_length=200)
    disable_thinking: bool = False

    @field_validator("base_url")
    @classmethod
    def _check_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            raise ValueError("接口地址必须以 http:// 或 https:// 开头")
        if parts.username or parts.password:
            raise ValueError("接口地址中不能包含账号密码")
        return value


class LLMConfigRead(BaseSchema):
    """What the UI may see: never the key itself, only a masked hint."""

    configured: bool
    source: Literal["custom", "server"]
    base_url: str | None = None
    model: str
    disable_thinking: bool = False
    api_key_hint: str | None = None


class LLMConfigTestResult(BaseSchema):
    ok: bool
    message: str
    latency_ms: int | None = None

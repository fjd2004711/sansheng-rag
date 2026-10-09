"""Per-user model config: encryption, masking, URL validation and runtime binding."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.exceptions import BadRequestError
from app.core.llm_runtime import LLMRuntime, current_llm, use_llm
from app.schemas.llm_config import LLMConfigUpdate
from app.services.llm_config import LLMConfigService, decrypt_secret, encrypt_secret, load_runtime


def test_secret_round_trip_and_ciphertext_differs() -> None:
    token = encrypt_secret("sk-abcdef123456")
    assert token != "sk-abcdef123456"
    assert decrypt_secret(token) == "sk-abcdef123456"


def test_decrypt_garbage_returns_none() -> None:
    assert decrypt_secret("enc:not-a-token") is None


@pytest.mark.parametrize("url", ["ftp://x.com", "api.example.com", "https://u:p@x.com/v1"])
def test_bad_base_url_is_rejected(url: str) -> None:
    with pytest.raises(ValidationError):
        LLMConfigUpdate(base_url=url, api_key="k", model="m")


def test_base_url_trailing_slash_is_trimmed() -> None:
    assert (
        LLMConfigUpdate(base_url="https://x.com/v1/", api_key="k", model="m").base_url
        == "https://x.com/v1"
    )


def test_runtime_defaults_to_server_and_binds_per_context() -> None:
    assert current_llm().is_custom is False
    mine = LLMRuntime(base_url="https://x/v1", api_key="k", model="mine", is_custom=True)
    with use_llm(mine):
        assert current_llm().model == "mine"
    assert current_llm().is_custom is False


@pytest.mark.anyio
async def test_cloud_metadata_endpoint_is_refused() -> None:
    service = LLMConfigService(AsyncMock())
    data = LLMConfigUpdate(base_url="http://169.254.169.254/v1", api_key="k", model="m")
    with pytest.raises(BadRequestError):
        await service.save(uuid4(), data)


@pytest.mark.anyio
async def test_saving_without_key_and_nothing_stored_is_refused() -> None:
    service = LLMConfigService(AsyncMock())
    data = LLMConfigUpdate(base_url="https://x.com/v1", model="m")
    with patch("app.services.llm_config.user_llm_config_repo") as repo:
        repo.get_by_user = AsyncMock(return_value=None)
        with pytest.raises(BadRequestError):
            await service.save(uuid4(), data)


@pytest.mark.anyio
async def test_read_never_exposes_the_key() -> None:
    config = SimpleNamespace(
        base_url="https://x.com/v1",
        api_key_encrypted=encrypt_secret("sk-secret-wxyz"),
        model="m",
        disable_thinking=True,
    )
    with patch("app.services.llm_config.user_llm_config_repo") as repo:
        repo.get_by_user = AsyncMock(return_value=config)
        result = await LLMConfigService(AsyncMock()).get(uuid4())
    assert result.api_key_hint == "…wxyz"
    assert "secret" not in result.model_dump_json()


@pytest.mark.anyio
async def test_load_runtime_decrypts_user_key_and_none_when_unset() -> None:
    config = SimpleNamespace(
        base_url="https://x.com/v1",
        api_key_encrypted=encrypt_secret("sk-1"),
        model="m",
        disable_thinking=False,
    )
    with patch("app.services.llm_config.user_llm_config_repo") as repo:
        repo.get_by_user = AsyncMock(return_value=config)
        runtime = await load_runtime(AsyncMock(), uuid4())
        assert runtime is not None and runtime.api_key == "sk-1" and runtime.is_custom
        repo.get_by_user = AsyncMock(return_value=None)
        assert await load_runtime(AsyncMock(), uuid4()) is None

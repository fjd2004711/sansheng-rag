"""The current user's own chat model (OpenAI-compatible endpoint)."""

from typing import Any

from fastapi import APIRouter

from app.api.deps import CurrentUser, LLMConfigSvc
from app.schemas.llm_config import LLMConfigRead, LLMConfigTestResult, LLMConfigUpdate

router = APIRouter()


@router.get("/llm-config", response_model=LLMConfigRead)
async def get_llm_config(service: LLMConfigSvc, user: CurrentUser) -> Any:
    return await service.get(user.id)


@router.put("/llm-config", response_model=LLMConfigRead)
async def save_llm_config(data: LLMConfigUpdate, service: LLMConfigSvc, user: CurrentUser) -> Any:
    return await service.save(user.id, data)


@router.delete("/llm-config", response_model=LLMConfigRead)
async def reset_llm_config(service: LLMConfigSvc, user: CurrentUser) -> Any:
    """Go back to the server's default model."""
    return await service.reset(user.id)


@router.post("/llm-config/test", response_model=LLMConfigTestResult)
async def test_llm_config(data: LLMConfigUpdate, service: LLMConfigSvc, user: CurrentUser) -> Any:
    return await service.test(user.id, data)

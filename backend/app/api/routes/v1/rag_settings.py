"""Admin: tune the self-correction loop without redeploying."""

from typing import Any

from fastapi import APIRouter

from app.api.deps import AppSettingsSvc, CurrentAdmin
from app.schemas.rag_settings import RagSettings
from app.services.app_settings import read_current

router = APIRouter()


@router.get("/rag-settings", response_model=RagSettings)
async def get_rag_settings(_: CurrentAdmin) -> Any:
    return read_current()


@router.put("/rag-settings", response_model=RagSettings)
async def save_rag_settings(data: RagSettings, service: AppSettingsSvc, _: CurrentAdmin) -> Any:
    return await service.save_rag(data)

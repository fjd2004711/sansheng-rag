"""Token usage statistics."""

from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdmin, CurrentUser, UsageSvc
from app.schemas.usage import AdminUsage, UsageSummary

router = APIRouter()


@router.get("/usage/me", response_model=UsageSummary)
async def my_usage(
    service: UsageSvc, user: CurrentUser, days: int = Query(30, ge=1, le=365)
) -> Any:
    """The caller's own token usage — never anyone else's."""
    return await service.summary(user.id, days=days)


@router.get("/usage/admin", response_model=AdminUsage)
async def usage_by_user(
    service: UsageSvc, _: CurrentAdmin, days: int = Query(30, ge=1, le=365)
) -> Any:
    """Per-user totals (admin only)."""
    return await service.admin_overview(days=days)

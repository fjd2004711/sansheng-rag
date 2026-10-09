"""Answer quality from real usage."""

from typing import Any, Literal

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, QualitySvc
from app.db.models.user import UserRole
from app.schemas.quality import Quality

router = APIRouter()


@router.get("/quality", response_model=Quality)
async def quality(
    service: QualitySvc,
    user: CurrentUser,
    days: int = Query(30, ge=1, le=365),
    scope: Literal["mine", "all"] = Query("mine"),
) -> Any:
    """Quality of the caller's own answers; administrators may ask for everyone's (``scope=all``)."""
    everyone = scope == "all" and user.has_role(UserRole.ADMIN)
    return await service.overview(
        days=days, user_id=None if everyone else user.id, scope="all" if everyone else "mine"
    )

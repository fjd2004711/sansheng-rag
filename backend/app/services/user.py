import contextlib
import logging
from uuid import UUID

from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    AlreadyExistsError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
)
from app.core.security import (
    get_password_hash,
    verify_password,
)
from app.db.models.user import User, UserRole
from app.repositories import user_repo
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.file_storage import get_file_storage

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _is_first_user(self) -> bool:
        count = (await self.db.execute(select(func.count()).select_from(User))).scalar_one()
        return count == 0

    async def get_by_id(self, user_id: UUID) -> User:
        user = await user_repo.get_by_id(self.db, user_id)
        if not user:
            raise NotFoundError(
                message="User not found",
                details={"user_id": user_id},
            )
        return user

    async def get_by_email(self, email: str) -> User | None:
        return await user_repo.get_by_email(self.db, email)

    async def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[User]:
        return await user_repo.get_multi(self.db, skip=skip, limit=limit)

    async def list_paginated(self) -> Page[UserRead]:
        return await paginate(self.db, user_repo.list_query())

    async def delete_non_admins(self) -> int:
        return await user_repo.delete_non_admins(self.db)

    async def has_any(self) -> bool:
        return await user_repo.has_any(self.db)

    async def register(self, user_in: UserCreate) -> User:
        """Create a local password account.

        The first user to register is auto-promoted to app-admin — no separate
        CLI step needed. That convenience is a land-grab on a public
        deployment, so the window matters: whoever registers first owns the
        app. Set ``FIRST_ADMIN_EMAIL`` (or run ``cmd create-app-admin``) and
        register before exposing the API publicly.
        """
        is_first_user = await self._is_first_user()
        if not settings.ALLOW_REGISTRATION and not is_first_user:
            raise AuthorizationError(message="本站已关闭自助注册，请联系管理员开通账号")
        await self._ensure_email_free(user_in.email)

        hashed_password = get_password_hash(user_in.password)
        user = await user_repo.create(
            self.db,
            email=user_in.email,
            hashed_password=hashed_password,
            full_name=user_in.full_name,
            role=UserRole.ADMIN.value if is_first_user else UserRole.USER.value,
            is_app_admin=is_first_user,
        )
        # Registration returns an access boundary. Commit before returning so an immediate login can read the account.
        await self.db.commit()
        return user

    async def registration_open(self) -> bool:
        return settings.ALLOW_REGISTRATION or await self._is_first_user()

    async def create_by_admin(self, user_in: UserCreate) -> User:
        """An account an admin creates; unlike self-registration it may be given the admin role."""
        await self._ensure_email_free(user_in.email)
        return await user_repo.create(
            self.db,
            email=user_in.email,
            hashed_password=get_password_hash(user_in.password),
            full_name=user_in.full_name,
            role=user_in.role.value,
        )

    async def _ensure_email_free(self, email: str) -> None:
        if await user_repo.get_by_email(self.db, email):
            raise AlreadyExistsError(message="Email already registered", details={"email": email})

    async def authenticate(self, email: str, password: str) -> User:
        user = await user_repo.get_by_email(self.db, email)
        if (
            not user
            or not user.hashed_password
            or not verify_password(password, user.hashed_password)
        ):
            raise AuthenticationError(message="Invalid email or password")
        if not user.is_active:
            raise AuthenticationError(message="User account is disabled")
        return user

    async def update(self, user_id: UUID, user_in: UserUpdate) -> User:
        user = await self.get_by_id(user_id)

        update_data = user_in.model_dump(exclude_unset=True)
        if "password" in update_data:
            update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

        return await user_repo.update(self.db, db_user=user, update_data=update_data)

    async def update_avatar(
        self, user_id: UUID, file_data: bytes, filename: str, content_type: str
    ) -> User:
        ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if content_type not in ALLOWED_AVATAR_TYPES:
            raise ValueError("Only JPEG, PNG, WebP, and GIF images are allowed")
        if len(file_data) > 2 * 1024 * 1024:
            raise ValueError("Avatar image too large. Maximum 2MB.")

        storage = get_file_storage()

        user = await self.get_by_id(user_id)
        if user.avatar_url:
            with contextlib.suppress(Exception):
                await storage.delete(user.avatar_url)

        storage_path = await storage.save(f"avatars/{user_id}", filename, file_data)
        return await user_repo.update(
            self.db, db_user=user, update_data={"avatar_url": storage_path}
        )

    def get_avatar_path(self, avatar_url: str) -> str | None:
        full_path = get_file_storage().get_full_path(avatar_url)
        return str(full_path) if full_path is not None else None

    async def delete(self, user_id: UUID) -> User:
        user = await user_repo.delete(self.db, user_id)
        if not user:
            raise NotFoundError(
                message="User not found",
                details={"user_id": user_id},
            )
        return user

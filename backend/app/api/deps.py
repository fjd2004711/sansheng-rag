"""API dependencies.

Dependency injection factories for services, repositories, and authentication.
"""
# ruff: noqa: I001 - Imports structured for Jinja2 template conditionals

from typing import Annotated

from fastapi import Depends
from fastapi import WebSocket, Cookie, WebSocketException
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

# scope="function": the session commits as soon as the endpoint returns, *before* the response is
# sent. With the default request scope the commit ran after the response, so a client that
# re-read immediately after a write (delete, update) could still see the old data.
DBSession = Annotated[AsyncSession, Depends(get_db_session, scope="function")]
from uuid import UUID

from app.db.session import get_db_context


from app.services.user import UserService
from app.services.conversation import ConversationService
from app.services.feedback import FeedbackService
from app.services.app_settings import AppSettingsService
from app.services.eval_candidate import EvalCandidateService
from app.services.orchestration.facade import OrchestrationService
from app.services.research_report import ResearchReportService
from app.services.insights import InsightsService
from app.services.llm_config import LLMConfigService
from app.services.quality import QualityService
from app.services.usage import UsageService


def get_user_service(db: DBSession) -> UserService:
    """Create UserService instance with database session."""
    return UserService(db)


UserSvc = Annotated[UserService, Depends(get_user_service)]


def get_conversation_service(db: DBSession) -> ConversationService:
    """Create ConversationService instance with database session."""
    return ConversationService(db)


ConversationSvc = Annotated[ConversationService, Depends(get_conversation_service)]


def get_feedback_service(db: DBSession) -> FeedbackService:
    """Create FeedbackService instance with database session."""
    return FeedbackService(db)


FeedbackSvc = Annotated[FeedbackService, Depends(get_feedback_service)]


def get_llm_config_service(db: DBSession) -> LLMConfigService:
    """Create LLMConfigService instance with database session."""
    return LLMConfigService(db)


LLMConfigSvc = Annotated[LLMConfigService, Depends(get_llm_config_service)]


def get_usage_service(db: DBSession) -> UsageService:
    """Create UsageService instance with database session."""
    return UsageService(db)


UsageSvc = Annotated[UsageService, Depends(get_usage_service)]


def get_insights_service(db: DBSession) -> InsightsService:
    """Create InsightsService instance with database session."""
    return InsightsService(db)


InsightsSvc = Annotated[InsightsService, Depends(get_insights_service)]


def get_eval_candidate_service(db: DBSession) -> EvalCandidateService:
    """Create EvalCandidateService instance with database session."""
    return EvalCandidateService(db)


EvalCandidateSvc = Annotated[EvalCandidateService, Depends(get_eval_candidate_service)]


def get_research_report_service(db: DBSession) -> ResearchReportService:
    """Create ResearchReportService instance with database session."""
    return ResearchReportService(db)


ResearchReportSvc = Annotated[ResearchReportService, Depends(get_research_report_service)]


def get_orchestration_service(db: DBSession) -> OrchestrationService:
    """Create OrchestrationService instance with database session."""
    return OrchestrationService(db)


OrchestrationSvc = Annotated[OrchestrationService, Depends(get_orchestration_service)]


def get_app_settings_service(db: DBSession) -> AppSettingsService:
    """Create AppSettingsService instance with database session."""
    return AppSettingsService(db)


AppSettingsSvc = Annotated[AppSettingsService, Depends(get_app_settings_service)]


def get_quality_service(db: DBSession) -> QualityService:
    """Create QualityService instance with database session."""
    return QualityService(db)


QualitySvc = Annotated[QualityService, Depends(get_quality_service)]


from app.services.rag_document import RAGDocumentService


def get_rag_document_service(db: DBSession) -> RAGDocumentService:
    """Create RAGDocumentService instance with database session."""
    return RAGDocumentService(db)


RAGDocumentSvc = Annotated[RAGDocumentService, Depends(get_rag_document_service)]
from app.services.file_upload import FileUploadService


def get_file_upload_service(db: DBSession) -> FileUploadService:
    """Create FileUploadService instance with database session."""
    return FileUploadService(db)


FileUploadSvc = Annotated[FileUploadService, Depends(get_file_upload_service)]
from app.core.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from app.core.security import verify_token
from app.db.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    user_service: UserSvc,
) -> User:
    """Get current authenticated user from JWT token.

    Returns the full User object including role information.

    Raises:
        AuthenticationError: If token is invalid or user not found.
    """

    payload = verify_token(token)
    if payload is None:
        raise AuthenticationError(message="Invalid or expired token")

    # Ensure this is an access token, not a refresh token
    if payload.get("type") != "access":
        raise AuthenticationError(message="Invalid token type")

    user_id = payload.get("sub")
    if user_id is None:
        raise AuthenticationError(message="Invalid token payload")

    user = await user_service.get_by_id(UUID(user_id))
    if not user.is_active:
        raise AuthenticationError(message="User account is disabled")

    return user


class RoleChecker:
    """Dependency class for role-based access control.

    Usage:
        # Require admin role
        @router.get("/admin-only")
        async def admin_endpoint(
            user: Annotated[User, Depends(RoleChecker(UserRole.ADMIN))]
        ):
            ...

        # Require any authenticated user
        @router.get("/users")
        async def users_endpoint(
            user: Annotated[User, Depends(get_current_user)]
        ):
            ...
    """

    def __init__(self, required_role: UserRole) -> None:
        self.required_role = required_role

    async def __call__(
        self,
        user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        """Check if user has the required role.

        Raises:
            AuthorizationError: If user doesn't have the required role.
        """
        if not user.has_role(self.required_role):
            raise AuthorizationError(
                message=f"Role '{self.required_role.value}' required for this action"
            )
        return user


async def get_current_active_superuser(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Get current user and verify they are a superuser.

    Raises:
        AuthorizationError: If user is not a superuser.
    """
    if not current_user.has_role(UserRole.ADMIN):
        raise AuthorizationError(message="Admin privileges required")
    return current_user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentSuperuser = Annotated[User, Depends(get_current_active_superuser)]
CurrentAdmin = Annotated[User, Depends(RoleChecker(UserRole.ADMIN))]


# is_app_admin is a global flag on the User model — independent of team
# membership. Routes guarded by this dep (e.g. /admin/users) stay reachable
# even when teams are disabled, so the dep itself must not be gated.
async def _require_app_admin(user: CurrentUser) -> User:
    """Raises 403 unless the user has the is_app_admin flag set."""
    if not getattr(user, "is_app_admin", False):
        raise AuthorizationError(message="App admin privileges required")
    return user


CurrentAppAdmin = Annotated[User, Depends(_require_app_admin)]


_WS_TOKEN_PROTOCOL_PREFIX = "access_token."


def _extract_ws_auth(websocket: WebSocket) -> tuple[str | None, str | None]:
    """Parse Sec-WebSocket-Protocol header for an auth token + app subprotocol.

    Clients pass the token as a subprotocol of the form
    ``access_token.<JWT>`` alongside an optional application subprotocol
    (e.g. ``chat``). Returns (token, app_subprotocol) — either may be None.
    """
    raw = websocket.headers.get("sec-websocket-protocol") or ""
    token: str | None = None
    app_subprotocol: str | None = None
    for proto in (p.strip() for p in raw.split(",") if p.strip()):
        if proto.startswith(_WS_TOKEN_PROTOCOL_PREFIX):
            token = proto[len(_WS_TOKEN_PROTOCOL_PREFIX) :]
        elif app_subprotocol is None:
            app_subprotocol = proto
    return token, app_subprotocol


async def get_current_user_ws(
    websocket: WebSocket,
    access_token: str | None = Cookie(None),
) -> User:
    """Authenticate a WebSocket connection.

    Token sources, checked in order:
    1. ``Sec-WebSocket-Protocol`` header, in the form ``access_token.<JWT>``.
       The chosen application subprotocol (e.g. ``chat``) is echoed back on
       ``accept()`` via ``websocket.state.accept_subprotocol``.
    2. Same-origin ``access_token`` cookie (fallback for same-origin clients).

    Tokens in query strings are NOT accepted — they leak into logs and
    Referer headers.

    The token is validated by the same authority as ``get_current_user``: the
    IdP's keys under delegated auth, this backend's ``SECRET_KEY`` otherwise.
    The two must not diverge — a WebSocket that trusts a different issuer than
    the REST API is an authentication bypass on whichever side is weaker.

    Raises:
        WebSocketException: If token is invalid or user not found. Raising the
            WebSocket-native exception lets Starlette close the handshake cleanly
            (close code 4001) — raising an HTTP-domain exception here instead
            bubbles up unhandled and yields an HTTP 500 on the WS upgrade.
    """

    subprotocol_token, app_subprotocol = _extract_ws_auth(websocket)
    websocket.state.accept_subprotocol = app_subprotocol

    auth_token = subprotocol_token or access_token

    if not auth_token:
        raise WebSocketException(code=4001, reason="Missing authentication token")
    payload = verify_token(auth_token)
    if payload is None:
        raise WebSocketException(code=4001, reason="Invalid or expired token")

    if payload.get("type") != "access":
        raise WebSocketException(code=4001, reason="Invalid token type")

    user_id = payload.get("sub")
    if user_id is None:
        raise WebSocketException(code=4001, reason="Invalid token payload")

    async with get_db_context() as db:
        user_service = UserService(db)
        try:
            user = await user_service.get_by_id(UUID(user_id))
        except NotFoundError:
            raise WebSocketException(code=4001, reason="User not found") from None

        if not user.is_active:
            raise WebSocketException(code=4001, reason="User account is disabled")

        # Eagerly load all columns, then detach from session to avoid
        # "instance not bound to a Session" errors after the context manager exits
        await db.refresh(user)
        db.expunge(user)
        return user


CurrentUserWS = Annotated[User, Depends(get_current_user_ws)]

import secrets

from fastapi.security import APIKeyHeader


api_key_header = APIKeyHeader(name=settings.API_KEY_HEADER, auto_error=False)


async def verify_api_key(
    api_key: Annotated[str | None, Depends(api_key_header)],
) -> str:
    """Verify API key from header.

    Uses constant-time comparison to prevent timing attacks.

    Raises:
        AuthenticationError: If API key is missing.
        AuthorizationError: If API key is invalid.
    """
    if api_key is None:
        raise AuthenticationError(message="API Key header missing")
    if not secrets.compare_digest(api_key, settings.API_KEY):
        raise AuthorizationError(message="Invalid API Key")
    return api_key


ValidAPIKey = Annotated[str, Depends(verify_api_key)]


from fastapi import Request

from app.core.config import settings
from app.services.rag.embeddings import EmbeddingService
from app.services.rag.ingestion import IngestionService
from app.services.rag.documents import DocumentProcessor
from app.services.rag.reranker import RerankService
from app.services.rag.retrieval import RetrievalService
from app.services.rag.vectorstore import QdrantVectorStore
from app.services.rag.vectorstore import BaseVectorStore


def get_embedding_service(request: Request) -> EmbeddingService:
    """Get embedding service from lifespan state or create new if not available."""
    if hasattr(request.state, "embedding_service"):
        return request.state.embedding_service  # type: ignore[no-any-return]
    return EmbeddingService(settings=settings.rag)


EmbeddingSvc = Annotated[EmbeddingService, Depends(get_embedding_service)]


def get_vectorstore(request: Request, embedder: EmbeddingSvc) -> BaseVectorStore:
    """Get vector store client from lifespan state or create new."""
    if hasattr(request.state, "vector_store"):
        return request.state.vector_store  # type: ignore[no-any-return]
    return QdrantVectorStore(settings=settings.rag, embedding_service=embedder)


VectorStoreSvc = Annotated[BaseVectorStore, Depends(get_vectorstore)]


def get_retrieval_service(vector_store: VectorStoreSvc) -> RetrievalService:
    """Create RetrievalService instance."""
    return RetrievalService(
        vector_store=vector_store,
        settings=settings.rag,
        rerank_service=RerankService(settings.rag),
    )


RetrievalSvc = Annotated[RetrievalService, Depends(get_retrieval_service)]


def get_document_processor() -> DocumentProcessor:
    """Create DocumentProcessor instance."""
    return DocumentProcessor(settings=settings.rag)


DocumentProcessorSvc = Annotated[DocumentProcessor, Depends(get_document_processor)]


def get_ingestion_service(
    processor: DocumentProcessorSvc,
    vector_store: VectorStoreSvc,
) -> IngestionService:
    """Create IngestionService instance."""
    return IngestionService(processor=processor, vector_store=vector_store)


IngestionSvc = Annotated[IngestionService, Depends(get_ingestion_service)]

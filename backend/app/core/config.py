"""Application configuration using Pydantic BaseSettings."""
# ruff: noqa: I001 - Imports structured for Jinja2 template conditionals

from pathlib import Path
from typing import Literal

from pydantic import computed_field, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> Path | None:
    """Find .env file in current or parent directories."""
    current = Path.cwd()
    for path in [current, current.parent]:
        env_file = path / ".env"
        if env_file.exists():
            return env_file
    return None


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=find_env_file(),
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "self_correcting_rag"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    DB_ECHO: bool = (
        False  # Set DB_ECHO=true to log SQL queries (latency + log-noise drain by default)
    )
    ENVIRONMENT: Literal["development", "local", "staging", "production"] = "local"
    TIMEZONE: str = (
        "Asia/Shanghai"  # IANA timezone (e.g. "UTC", "Europe/Warsaw", "America/New_York")
    )
    MODELS_CACHE_DIR: Path = Path("./models_cache")
    MEDIA_DIR: Path = Path("./media")
    MAX_UPLOAD_SIZE_MB: int = 50  # Max file upload size in MB

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "self_correcting_rag"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL(self) -> str:
        """Build async PostgreSQL connection URL."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL_SYNC(self) -> str:
        """Build sync PostgreSQL connection URL (for Alembic).

        The driver is named because a bare ``postgresql://`` means psycopg 3 on
        SQLAlchemy 2.1 but psycopg2 on 2.0, which SQLModel pins.
        """
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info: ValidationInfo) -> str:
        """Validate SECRET_KEY is secure in production."""
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        env = info.data.get("ENVIRONMENT", "local") if info.data else "local"
        if v == "change-me-in-production-use-openssl-rand-hex-32" and env == "production":
            raise ValueError(
                "SECRET_KEY must be changed in production! "
                "Generate a secure key with: openssl rand -hex 32"
            )
        return v

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # 30 minutes
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ALGORITHM: str = "HS256"

    # Public URL of the frontend.
    FRONTEND_URL: str = "http://localhost:3010"

    API_KEY: str = "change-me-in-production"
    API_KEY_HEADER: str = "X-API-Key"

    @field_validator("API_KEY")
    @classmethod
    def validate_api_key(cls, v: str, info: ValidationInfo) -> str:
        """Validate API_KEY is set in production."""
        env = info.data.get("ENVIRONMENT", "local") if info.data else "local"
        if v == "change-me-in-production" and env == "production":
            raise ValueError(
                "API_KEY must be changed in production! "
                "Generate a secure key with: openssl rand -hex 32"
            )
        return v

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-5.5"
    AI_TEMPERATURE: float = 0.7
    AI_THINKING_ENABLED: bool = False
    # Send ``enable_thinking=false`` to OpenAI-compatible providers that think by default (e.g.
    # DashScope Qwen3). Their thinking mode rejects ``tool_choice="required"`` and is slow for the
    # short JSON judging calls.
    AI_DISABLE_THINKING: bool = False
    AI_THINKING_EFFORT: str = "medium"  # "low", "medium", "high"
    AI_AVAILABLE_MODELS: list[str] = [
        "gpt-5.5",
        "gpt-5.5-pro",
        "gpt-5.4",
        "gpt-5.4-pro",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5",
        "gpt-4.1",
    ]
    AI_FRAMEWORK: str = "langchain"
    LLM_PROVIDER: str = "openai"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_HTTPS: bool = False
    QDRANT_TIMEOUT_SECONDS: int = 30
    QDRANT_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_BASE_URL: str = "https://api.openai.com/v1"
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_DIMENSION: int = 3072

    RAG_CHUNK_SIZE: int = 512
    RAG_CHUNK_OVERLAP: int = 50

    RAG_DEFAULT_COLLECTION: str = "documents"
    RAG_TOP_K: int = 10
    RAG_CHUNKING_STRATEGY: str = "recursive"  # recursive, markdown, or fixed
    RAG_HYBRID_SEARCH: bool = False  # Enable independent BM25 + Dense + RRF
    RAG_ENABLE_OCR: bool = False  # OCR fallback for scanned PDFs (requires tesseract)
    RAG_RERANKER_ENABLED: bool = False
    RAG_RERANKER_MODEL: str = ""
    RAG_RERANKER_CANDIDATE_LIMIT: int = 12
    RAG_CORRECTION_ENABLED: bool = False
    RAG_MAX_CORRECTION_ROUNDS: int = 2
    RAG_GENERATION_CORRECTION_ENABLED: bool = False
    RAG_MAX_GENERATION_CORRECTIONS: int = 1

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["*"]
    CORS_ALLOW_HEADERS: list[str] = ["*"]

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: list[str], info: ValidationInfo) -> list[str]:
        """Warn if CORS_ORIGINS is too permissive in production."""
        env = info.data.get("ENVIRONMENT", "local") if info.data else "local"
        if "*" in v and env == "production":
            raise ValueError(
                "CORS_ORIGINS cannot contain '*' in production! Specify explicit allowed origins."
            )
        return v

    @computed_field  # type: ignore[prop-decorator]
    @property
    def llm_extra_body(self) -> dict[str, object] | None:
        """Provider-specific request fields for chat completions, or None for plain providers."""
        return {"enable_thinking": False} if self.AI_DISABLE_THINKING else None

    @property
    def rag(self) -> "RAGSettings":
        """Build RAG-specific settings."""
        pdf_parser = PdfParser()

        return RAGSettings(
            collection_name=self.RAG_DEFAULT_COLLECTION,
            chunk_size=self.RAG_CHUNK_SIZE,
            chunk_overlap=self.RAG_CHUNK_OVERLAP,
            chunking_strategy=self.RAG_CHUNKING_STRATEGY,
            enable_hybrid_search=self.RAG_HYBRID_SEARCH,
            enable_ocr=self.RAG_ENABLE_OCR,
            reranker_config=RerankerConfig(
                enabled=self.RAG_RERANKER_ENABLED,
                model=self.RAG_RERANKER_MODEL or self.AI_MODEL,
                base_url=self.OPENAI_BASE_URL,
                api_key=self.OPENAI_API_KEY,
                candidate_limit=self.RAG_RERANKER_CANDIDATE_LIMIT,
            ),
            correction_config=CorrectionConfig(
                enabled=self.RAG_CORRECTION_ENABLED,
                max_rounds=self.RAG_MAX_CORRECTION_ROUNDS,
            ),
            generation_correction_config=GenerationCorrectionConfig(
                enabled=self.RAG_GENERATION_CORRECTION_ENABLED,
                max_corrections=self.RAG_MAX_GENERATION_CORRECTIONS,
            ),
            embeddings_config=EmbeddingsConfig(
                model=self.EMBEDDING_MODEL,
                dim=self.EMBEDDING_DIMENSION,
            ),
            document_parser=DocumentParser(),
            pdf_parser=pdf_parser,
        )


# Rebuild Settings to resolve RAGSettings forward reference
from app.services.rag.config import (
    CorrectionConfig,
    DocumentParser,
    EmbeddingsConfig,
    GenerationCorrectionConfig,
    PdfParser,
    RAGSettings,
    RerankerConfig,
)

Settings.model_rebuild()


settings = Settings()

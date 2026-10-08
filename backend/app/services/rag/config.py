"""RAG configuration."""

from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class DocumentExtensions(StrEnum):
    """Extensions supported by the RAG ingestion pipeline."""

    PDF = ".pdf"
    DOCX = ".docx"
    MD = ".md"
    TXT = ".txt"


PYMUPDF_FORMATS: set[str] = {".pdf", ".docx", ".txt", ".md"}

LITEPARSE_FORMATS: set[str] = {
    ".pdf",
    ".docx",
    ".xlsx",
    ".pptx",
    ".txt",
    ".md",
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
}

LLAMAPARSE_FORMATS: set[str] = {
    ".pdf",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".rtf",
    ".txt",
    ".md",
    ".epub",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".webp",
    ".xlsx",
    ".xls",
    ".csv",
    ".tsv",
    ".ods",
    ".mp3",
    ".mp4",
    ".wav",
    ".m4a",
    ".webm",
    ".html",
    ".htm",
    ".xml",
}

PARSER_FORMATS: dict[str, set[str]] = {
    "pymupdf": PYMUPDF_FORMATS,
    "liteparse": LITEPARSE_FORMATS,
    "llamaparse": LLAMAPARSE_FORMATS,
}


def get_supported_formats(parser_name: str = "pymupdf") -> set[str]:
    """Get supported file formats for a given parser."""
    return PARSER_FORMATS.get(parser_name, PYMUPDF_FORMATS)


# Known embedding models and their output dimensions.
# Used to auto-set vector store dimension from model name.
EMBEDDING_DIMENSIONS: dict[str, int] = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "voyage-3": 1024,
    "voyage-3-lite": 512,
    "voyage-code-3": 1024,
    "gemini-embedding-exp-03-07": 3072,
    "all-MiniLM-L6-v2": 384,
    "all-mpnet-base-v2": 768,
    "bge-small-en-v1.5": 384,
    "bge-base-en-v1.5": 768,
    "bge-large-en-v1.5": 1024,
    "nomic-embed-text": 768,
}


class EmbeddingsConfig(BaseModel):
    """Embeddings configuration. Dimension is auto-derived from model name."""

    model: str = "text-embedding-3-large"
    dim: int = 3072

    @model_validator(mode="after")
    def set_dim_from_model(self) -> "EmbeddingsConfig":
        if self.model in EMBEDDING_DIMENSIONS and self.dim == 3072:
            self.dim = EMBEDDING_DIMENSIONS[self.model]
        return self


class DocumentParser(BaseModel):
    """Document parsing settings (non-PDF files)."""

    method: str = "python_native"


class PdfParser(BaseModel):
    """PDF parsing settings."""

    method: str = "pymupdf"


class RerankerConfig(BaseModel):
    """P1 relevance-reranker settings."""

    enabled: bool = False
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    candidate_limit: int = 12


class CorrectionConfig(BaseModel):
    """P2 bounded retrieval self-correction configuration."""

    enabled: bool = False
    max_rounds: int = Field(default=2, ge=1)


class GenerationCorrectionConfig(BaseModel):
    """P3 bounded answer verification and correction configuration."""

    enabled: bool = False
    max_corrections: int = Field(default=1, ge=1)


class RAGSettings(BaseModel):
    """RAG pipeline configuration."""

    collection_name: str = "documents"

    allowed_extensions: list[DocumentExtensions] = Field(
        default_factory=lambda: list(DocumentExtensions)
    )

    chunk_size: int = 512
    chunk_overlap: int = 50
    chunking_strategy: str = "recursive"
    enable_hybrid_search: bool = False
    enable_ocr: bool = False
    reranker_config: RerankerConfig = Field(default_factory=RerankerConfig)
    correction_config: CorrectionConfig = Field(default_factory=CorrectionConfig)
    generation_correction_config: GenerationCorrectionConfig = Field(
        default_factory=GenerationCorrectionConfig
    )

    embeddings_config: EmbeddingsConfig = Field(default_factory=EmbeddingsConfig)

    document_parser: DocumentParser = Field(default_factory=DocumentParser)
    pdf_parser: PdfParser = Field(default_factory=PdfParser)
    gdrive_ingestion: bool = False

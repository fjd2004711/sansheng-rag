import asyncio
import hashlib
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import pymupdf
from docx import Document as DOCXDocument
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

from app.services.rag.config import DocumentExtensions, RAGSettings
from app.services.rag.models import Document, DocumentMetadata, DocumentPage, DocumentPageChunk
from app.services.rag.ocr import (
    ImageDescriber,
    build_image_describer,
    describe_ocr_error,
    has_words,
)

logger = logging.getLogger(__name__)


class BaseDocumentParser(ABC):
    allowed = [f"{ext.value}" for ext in DocumentExtensions]

    def is_file_existing(self, filepath: Path) -> bool:
        return Path.exists(filepath)

    def is_extension_allowed(self, filepath: Path) -> bool:
        return filepath.suffix.lower() in self.allowed and self.is_file_existing(filepath)

    def get_document_metadata(self, filepath: Path) -> DocumentMetadata:
        content_hash = hashlib.sha256(filepath.read_bytes()).hexdigest()
        return DocumentMetadata(
            filename=filepath.name,
            filesize=filepath.stat().st_size,
            filetype=filepath.suffix.replace(".", ""),
            source_path=str(filepath.resolve()),
            content_hash=content_hash,
        )

    @abstractmethod
    async def parse(self, filepath: Path) -> Document:
        """Parse a file and read its content into a Document object.
        Args:
            filepath: Path to the file to parse.
        Returns:
            Document object with parsed content and metadata.
        """
        pass


class TextDocumentParser(BaseDocumentParser):
    """Parser for text-based documents (TXT, MD).
    Uses Python's built-in file reading capabilities to extract
    text content from plain text and Markdown files.
    """

    def _parse_text_file(self, filepath: Path) -> Document:
        """Extract raw text from a TXT or MD file.
        Args:
            filepath: Path to the text file.
        Returns:
            Document object with the file content.
        """
        with open(filepath, encoding="utf-8") as f:
            page = DocumentPage(page_num=1, content=f.read())

        return Document(pages=[page], metadata=self.get_document_metadata(filepath))

    async def parse(self, filepath: Path) -> Document:
        """Parse a text file (TXT or MD).

        Args:
            filepath: Path to the text file.

        Returns:
            Document object with parsed content.

        Raises:
            ValueError: If the file extension is not supported.
        """
        if not self.is_extension_allowed(filepath):
            raise ValueError(f"Extension {filepath.suffix} not supported by TextDocumentParser")

        if filepath.suffix in (".txt", ".md"):
            return self._parse_text_file(filepath)
        else:
            raise ValueError(f"Unsupported file extension. Allowed extensions: {self.allowed}")


class DocxDocumentParser(BaseDocumentParser):
    """Parser for DOCX documents using python-docx.

    Extracts text content from Microsoft Word documents by reading
    all paragraphs and joining them with newline characters.
    """

    def _parse_docx_file(self, filepath: Path) -> Document:
        """Extract raw text from the DOCX file.

        Args:
            filepath: Path to the DOCX file.

        Returns:
            Document object with the file content.
        """
        file: Any = DOCXDocument(str(filepath))
        # Paragraphs and tables in document order: policy tables often hold the key facts.
        blocks: list[str] = []
        for child in file.element.body.iterchildren():
            if child.tag.endswith("}p"):
                blocks.append(
                    "".join(node.text or "" for node in child.iter() if node.tag.endswith("}t"))
                )
            elif child.tag.endswith("}tbl"):
                for table in file.tables:
                    if table._element is child:
                        blocks.extend(
                            " | ".join(cell.text.strip() for cell in row.cells)
                            for row in table.rows
                        )
        page = DocumentPage(page_num=1, content="\n".join(blocks))
        return Document(pages=[page], metadata=self.get_document_metadata(filepath))

    async def parse(self, filepath: Path) -> Document:
        """Parse a DOCX file.

        Args:
            filepath: Path to the DOCX file.

        Returns:
            Document object with parsed content.

        Raises:
            ValueError: If the file is not a DOCX file.
        """
        if not self.is_extension_allowed(filepath):
            raise ValueError(f"Extension {filepath.suffix} not supported by DocxDocumentParser")

        if filepath.suffix == ".docx":
            return self._parse_docx_file(filepath)
        else:
            raise ValueError(f"Unsupported file extension. Allowed extensions: {self.allowed}")


class OCRFailedError(ValueError):
    """A scanned page could not be transcribed; the message is shown to the uploader."""


class PyMuPDFParser(BaseDocumentParser):
    """Smart PDF parser using PyMuPDF.

    Features:
    - Text extraction with layout preservation (blocks)
    - Table detection → markdown tables
    - Header/footer detection and removal
    - OCR fallback for scanned pages via a vision-model ``image_describer`` (optional)
    - Document metadata (author, title, TOC)
    """

    MIN_TEXT_LENGTH = 50  # below this → likely a scan, try OCR

    def __init__(
        self,
        image_describer: ImageDescriber | None = None,
        *,
        ocr_dpi: int = 150,
        ocr_concurrency: int = 3,
    ):
        self._image_describer = image_describer
        self._ocr_dpi = ocr_dpi
        self._ocr_concurrency = ocr_concurrency

    @property
    def enable_ocr(self) -> bool:
        return self._image_describer is not None

    def _detect_repeated_content(self, doc: Any) -> set[str]:
        """Detect headers/footers — text appearing on >70% of pages."""
        if len(doc) < 3:
            return set()
        text_counts: dict[str, int] = {}
        for page in doc:
            for b in page.get_text("blocks"):
                if b[6] != 0:  # skip image blocks
                    continue
                y_ratio = b[1] / page.rect.height if page.rect.height else 0
                if y_ratio < 0.15 or y_ratio > 0.85:
                    text = b[4].strip()
                    if text and len(text) < 200:
                        text_counts[text] = text_counts.get(text, 0) + 1
        threshold = len(doc) * 0.7
        return {t for t, c in text_counts.items() if c >= threshold}

    def _extract_text(self, page: Any, repeated: set[str]) -> str:
        """Extract text blocks, filtering headers/footers."""
        texts = []
        for b in page.get_text("blocks"):
            if b[6] != 0:  # skip image blocks
                continue
            text = b[4].strip()
            if text and text not in repeated:
                texts.append(text)
        return str("\n\n".join(texts))

    def _extract_tables(self, page: Any) -> str:
        """Extract tables as markdown."""
        try:
            tables = page.find_tables()
            if not tables or not tables.tables:
                return ""
            parts = []
            for table in tables.tables:
                df = table.to_pandas()
                if not df.empty:
                    parts.append(df.to_markdown(index=False))
            return "\n\n".join(parts)
        except Exception:
            return ""

    def _extract_pdf(self, filepath: Path) -> tuple[Document, dict[int, bytes]]:
        """Blocking PyMuPDF pass: text layer per page, plus rendered PNGs of pages that need OCR."""
        doc: Any = pymupdf.open(filepath)  # type: ignore[no-untyped-call]
        try:
            meta = doc.metadata or {}
            toc = doc.get_toc()
            repeated = self._detect_repeated_content(doc)

            pages: list[DocumentPage] = []
            scans: dict[int, bytes] = {}  # index in `pages` -> page image
            for page in doc:
                text = self._extract_text(page, repeated)

                tables_md = self._extract_tables(page)
                if tables_md:
                    text = text + "\n\n" + tables_md if text.strip() else tables_md

                if self.enable_ocr and len(text.strip()) < self.MIN_TEXT_LENGTH:
                    scans[len(pages)] = page.get_pixmap(dpi=self._ocr_dpi).tobytes("png")

                pages.append(DocumentPage(page_num=page.number + 1, content=text))
        finally:
            doc.close()

        additional: dict[str, Any] = {}
        if meta.get("title"):
            additional["pdf_title"] = meta["title"]
        if meta.get("author"):
            additional["pdf_author"] = meta["author"]
        if toc:
            additional["toc"] = [{"level": t[0], "title": t[1], "page": t[2]} for t in toc[:20]]

        doc_meta = self.get_document_metadata(filepath)
        if additional:
            doc_meta.additional_info = {**(doc_meta.additional_info or {}), **additional}

        return Document(pages=pages, metadata=doc_meta), scans

    async def _ocr_pages(self, pages: list[DocumentPage], scans: dict[int, bytes]) -> None:
        """Transcribe scanned pages in place; any failed page fails the whole file."""
        assert self._image_describer is not None
        describer = self._image_describer
        semaphore = asyncio.Semaphore(self._ocr_concurrency)

        async def transcribe(image: bytes) -> str:
            async with semaphore:
                return await describer.describe(image, "image/png")

        indexes = list(scans)
        results = await asyncio.gather(
            *(transcribe(scans[i]) for i in indexes), return_exceptions=True
        )
        for index, result in zip(indexes, results, strict=True):
            page = pages[index]
            if isinstance(result, BaseException):
                logger.warning("OCR failed for page %d: %r", page.page_num, result)
                reason = describe_ocr_error(result)
                raise OCRFailedError(
                    f"扫描页文字识别失败（第 {page.page_num} 页）：{reason}"
                ) from result
            # Logo or blank pages come back as stray markup such as "#"; keep them empty.
            if has_words(result) and len(result.strip()) > len(page.content.strip()):
                page.content = result
                page.extraction = "ocr"
                logger.info("OCR used for page %d", page.page_num)

    async def _parse_pdf_file(self, filepath: Path) -> Document:
        """Parse PDF with smart extraction pipeline."""
        # PyMuPDF is blocking; keep it off the event loop (ingestion runs inside the API process).
        document, scans = await asyncio.to_thread(self._extract_pdf, filepath)
        if scans:
            await self._ocr_pages(document.pages, scans)
        return document

    async def parse(self, filepath: Path) -> Document:
        if not self.is_extension_allowed(filepath):
            raise ValueError(f"Extension {filepath.suffix} not supported by PyMuPDFParser")
        if filepath.suffix == ".pdf":
            return await self._parse_pdf_file(filepath)
        raise ValueError(f"Unsupported: {filepath.suffix}")


class DocumentProcessor:
    """Orchestrates parsing and chunking of files into Document objects.

    Manages the document processing pipeline:
    1. Route to appropriate parser based on file extension
    2. Parse document content
    3. Chunk document pages using RecursiveCharacterTextSplitter
    Supported file types:
    - TXT, MD: TextDocumentParser (Python native)
    - DOCX: DocxDocumentParser (Python native)
    - PDF: PyMuPDFParser (local, tables, OCR fallback)
    """

    def __init__(self, settings: RAGSettings):
        """Initialize the document processor.

        Args:
            settings: RAG configuration settings.
        """
        self.settings = settings
        self.splitter = self._create_splitter(settings)

        # Always use Python native parser for plain text
        self.text_parser = TextDocumentParser()
        self.docx_parser = DocxDocumentParser()
        self.pdf_parser = PyMuPDFParser(
            build_image_describer(settings.ocr_config),
            ocr_dpi=settings.ocr_config.dpi,
            ocr_concurrency=settings.ocr_config.concurrency,
        )

    @staticmethod
    def _create_splitter(settings: RAGSettings) -> Any:
        """Create text splitter based on chunking strategy."""
        strategy = settings.chunking_strategy

        if strategy == "markdown":
            # Split by markdown headers, then by size
            return MarkdownHeaderTextSplitter(
                headers_to_split_on=[
                    ("#", "h1"),
                    ("##", "h2"),
                    ("###", "h3"),
                ],
                strip_headers=False,
            )

        if strategy == "fixed":
            # Simple fixed-size chunks with no smart splitting
            return RecursiveCharacterTextSplitter(
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
                length_function=len,
                separators=["\n"],
            )

        # Default: recursive (smart splitting by paragraphs, sentences, words)
        return RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            length_function=len,
            is_separator_regex=False,
        )

    async def process_file(self, filepath: Path) -> Document:
        """Main entry point: filepath -> Document with chunks.

        Args:
            filepath: Path to the file to process.

        Returns:
            Document object with parsed pages and chunked content.

        Raises:
            ValueError: If the file type is not supported.
        """
        if filepath.suffix in (".txt", ".md"):
            document = await self.text_parser.parse(filepath)
        elif filepath.suffix == ".docx":
            document = await self.docx_parser.parse(filepath)
        elif filepath.suffix == ".pdf":
            document = await self.pdf_parser.parse(filepath)
        else:
            raise ValueError(f"Unsupported file type: {filepath.suffix}")

        pages = document.pages

        chunked_pages: list[DocumentPageChunk] = []
        is_markdown_splitter = self.settings.chunking_strategy == "markdown"
        for page in pages:
            if is_markdown_splitter:
                # MarkdownHeaderTextSplitter returns Document objects
                md_docs = self.splitter.split_text(page.content)
                chunks = [doc.page_content for doc in md_docs]
            else:
                chunks = self.splitter.split_text(page.content)
            for chunk_num, chunk in enumerate(chunks):
                chunked_pages.append(
                    DocumentPageChunk(
                        chunk_content=chunk,
                        chunk_num=chunk_num,
                        parent_doc_id=document.id,
                        **page.model_dump(exclude={"parent_doc_id"}),
                    )
                )

        # Add chunked pages to original document
        document.chunked_pages = chunked_pages
        return document

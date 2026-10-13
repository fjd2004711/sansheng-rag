"""Scanned (image-only) PDF pages go through the vision-model OCR fallback."""

from pathlib import Path
from types import SimpleNamespace

import fitz
import httpx
import openai
import pytest

from app.services.rag.config import OCRConfig, RAGSettings
from app.services.rag.documents import DocumentProcessor, OCRFailedError
from app.services.rag.ocr import VisionOCRDescriber, build_image_describer

TEXT_PAGE = "Atlas compliance requires the CRIMSON-SEAL credential before release. " * 2
OCR_TEXT = "| 风力等级 | 风速 m/s |\n| --- | --- |\n| 6 | 10.8～13.8 |"


class FakeDescriber:
    def __init__(self, result: str = OCR_TEXT, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.calls: list[tuple[int, str]] = []

    async def describe(self, image_bytes: bytes, mime_type: str) -> str:
        self.calls.append((len(image_bytes), mime_type))
        if self.error:
            raise self.error
        return self.result


def _processor(describer: FakeDescriber | None) -> DocumentProcessor:
    processor = DocumentProcessor(RAGSettings())
    processor.pdf_parser._image_describer = describer
    return processor


def _pdf(tmp_path: Path, *, text_pages: int, scanned_pages: int) -> Path:
    """A PDF whose scanned pages carry only an image (no text layer), like a scanner's output."""
    pixmap = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 40), False)
    pixmap.clear_with(200)
    pdf = fitz.open()
    for _ in range(text_pages):
        pdf.new_page().insert_text((72, 100), TEXT_PAGE)
    for _ in range(scanned_pages):
        pdf.new_page().insert_image(fitz.Rect(72, 72, 300, 300), pixmap=pixmap)
    path = tmp_path / "scan.pdf"
    pdf.save(path)
    return path


@pytest.mark.anyio
async def test_scanned_page_is_transcribed_and_marked_as_ocr(tmp_path: Path) -> None:
    describer = FakeDescriber()
    document = await _processor(describer).process_file(
        _pdf(tmp_path, text_pages=0, scanned_pages=2)
    )

    assert len(describer.calls) == 2
    assert all(mime == "image/png" and size > 0 for size, mime in describer.calls)
    assert [page.extraction for page in document.pages] == ["ocr", "ocr"]
    chunk = document.chunked_pages[0]
    assert "10.8～13.8" in chunk.chunk_content
    assert chunk.extraction == "ocr"
    assert chunk.page_num == 1


@pytest.mark.anyio
async def test_page_with_text_layer_skips_ocr(tmp_path: Path) -> None:
    describer = FakeDescriber()
    document = await _processor(describer).process_file(
        _pdf(tmp_path, text_pages=1, scanned_pages=1)
    )

    assert len(describer.calls) == 1  # only the scanned page
    assert [page.extraction for page in document.pages] == ["text", "ocr"]
    assert "CRIMSON-SEAL" in document.pages[0].content


@pytest.mark.anyio
async def test_ocr_failure_raises_readable_error_with_page_number(tmp_path: Path) -> None:
    describer = FakeDescriber(error=RuntimeError("model not found"))

    with pytest.raises(OCRFailedError, match="扫描页文字识别失败（第 2 页）：model not found"):
        await _processor(describer).process_file(_pdf(tmp_path, text_pages=1, scanned_pages=1))


@pytest.mark.anyio
async def test_ocr_disabled_leaves_scanned_page_empty(tmp_path: Path) -> None:
    document = await _processor(None).process_file(_pdf(tmp_path, text_pages=0, scanned_pages=1))

    assert document.chunked_pages == []


def test_build_image_describer_requires_flag_and_model() -> None:
    assert build_image_describer(OCRConfig(enabled=False, model="qwen-vl-max")) is None
    assert build_image_describer(OCRConfig(enabled=True, model="")) is None
    assert isinstance(
        build_image_describer(OCRConfig(enabled=True, model="qwen-vl-max", base_url="http://x/v1")),
        VisionOCRDescriber,
    )


@pytest.mark.anyio
async def test_vision_describer_sends_image_and_strips_code_fence() -> None:
    sent: dict = {}

    async def create(**kwargs):
        sent.update(kwargs)
        message = SimpleNamespace(content="```markdown\n# 风力等级\n```")
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    describer = VisionOCRDescriber(OCRConfig(enabled=True, model="qwen-vl-max"), client=client)

    assert await describer.describe(b"png-bytes", "image/png") == "# 风力等级"
    assert sent["model"] == "qwen-vl-max"
    image_part = sent["messages"][0]["content"][0]
    assert image_part["image_url"]["url"].startswith("data:image/png;base64,")


def test_search_results_label_ocr_chunks() -> None:
    from app.agents.tools.rag_tool import _format_results
    from app.services.rag.models import SearchResult

    meta = {"filename": "风力等级.pdf", "page_num": 3, "chunk_num": 0}
    text = _format_results(
        [
            SearchResult(
                content="6 级 10.8～13.8", score=0.9, metadata={**meta, "extraction": "ocr"}
            ),
            SearchResult(content="正文", score=0.5, metadata={**meta, "extraction": "text"}),
        ]
    )

    assert "[1] Source: 风力等级.pdf, page 3, chunk 0, ocr (score: 0.900)" in text
    assert "[2] Source: 风力等级.pdf, page 3, chunk 0 (score: 0.500)" in text


@pytest.mark.anyio
async def test_ocr_output_without_words_is_dropped(tmp_path: Path) -> None:
    describer = FakeDescriber(result="#\n")  # what a vision model returns for a logo-only page
    document = await _processor(describer).process_file(
        _pdf(tmp_path, text_pages=0, scanned_pages=1)
    )

    assert document.pages[0].extraction == "text"
    assert document.chunked_pages == []


@pytest.mark.anyio
async def test_provider_error_is_reported_without_raw_json(tmp_path: Path) -> None:
    request = httpx.Request("POST", "https://maas.example/v1/chat/completions")
    response = httpx.Response(403, request=request)
    body = {"message": "Free quota exhausted.", "code": "insufficient_quota"}
    error = openai.PermissionDeniedError("Error code: 403 - {...}", response=response, body=body)

    with pytest.raises(OCRFailedError) as raised:
        await _processor(FakeDescriber(error=error)).process_file(
            _pdf(tmp_path, text_pages=0, scanned_pages=1)
        )

    assert (
        str(raised.value)
        == "扫描页文字识别失败（第 1 页）：视觉模型返回 403：Free quota exhausted."
    )

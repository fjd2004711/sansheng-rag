"""Real PDF / DOCX / Markdown / TXT files go through parsing and chunking."""

from pathlib import Path

import fitz
import pytest
from docx import Document as WordDocument

from app.core.config import settings
from app.services.rag.documents import DocumentProcessor

SENTENCE = "Atlas compliance requires the CRIMSON-SEAL credential before release."


@pytest.fixture
def processor() -> DocumentProcessor:
    return DocumentProcessor(settings.rag)


def _joined(document) -> str:
    return " ".join(chunk.chunk_content for chunk in document.chunked_pages)


@pytest.mark.anyio
async def test_docx_paragraphs_and_table_text_are_extracted(tmp_path: Path, processor) -> None:
    word = WordDocument()
    word.add_heading("Release policy", level=1)
    word.add_paragraph(SENTENCE)
    table = word.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Owner"
    table.cell(0, 1).text = "Contact"
    table.cell(1, 0).text = "Atlas"
    table.cell(1, 1).text = "ops-desk"
    path = tmp_path / "policy.docx"
    word.save(path)

    document = await processor.process_file(path)

    assert "CRIMSON-SEAL" in _joined(document)
    assert "Atlas | ops-desk" in _joined(document)
    assert document.metadata.filetype == "docx"


@pytest.mark.anyio
async def test_pdf_keeps_page_numbers_for_citations(tmp_path: Path, processor) -> None:
    pdf = fitz.open()
    for text in ("First page about billing.", SENTENCE):
        page = pdf.new_page()
        page.insert_text((72, 100), text)
    path = tmp_path / "policy.pdf"
    pdf.save(path)

    document = await processor.process_file(path)

    hit = next(chunk for chunk in document.chunked_pages if "CRIMSON-SEAL" in chunk.chunk_content)
    assert hit.page_num == 2


@pytest.mark.anyio
async def test_markdown_and_txt_are_chunked(tmp_path: Path, processor) -> None:
    for name in ("note.md", "note.txt"):
        path = tmp_path / name
        path.write_text(f"# Title\n\n{SENTENCE}\n", encoding="utf-8")
        assert "CRIMSON-SEAL" in _joined(await processor.process_file(path))


@pytest.mark.anyio
async def test_unsupported_extension_is_refused(tmp_path: Path, processor) -> None:
    path = tmp_path / "slides.pptx"
    path.write_bytes(b"x")
    with pytest.raises(ValueError):
        await processor.process_file(path)


@pytest.mark.anyio
async def test_chinese_docx_round_trips(tmp_path: Path, processor) -> None:
    word = WordDocument()
    word.add_paragraph("员工请假须提前三个工作日提交申请。")
    path = tmp_path / "leave.docx"
    word.save(path)
    assert "提前三个工作日" in _joined(await processor.process_file(path))

"""Research mode: answer from the web with cited, verified claims; long-form reports exported as Word / PDF."""

from app.services.research.facade import ResearchEvents, ResearchService
from app.services.research.models import ResearchResult, WebSource
from app.services.research.report_builder import ReportBuilder
from app.services.research.report_docx import render_docx
from app.services.research.report_markdown import render_chat_markdown
from app.services.research.report_models import ResearchReport as ReportDocument
from app.services.research.report_pdf import render_pdf

__all__ = [
    "ReportBuilder",
    "ReportDocument",
    "ResearchEvents",
    "ResearchResult",
    "ResearchService",
    "WebSource",
    "render_chat_markdown",
    "render_docx",
    "render_pdf",
]

"""Vision-model OCR for scanned PDF pages.

Scanned PDFs have no text layer, so the parser renders such pages to images and asks an
OpenAI-compatible vision model (e.g. Qwen-VL on DashScope/MaaS, or ``qwen3-vl`` on Ollama)
to transcribe them verbatim.
"""

import base64
import logging
import re
from typing import Protocol

from openai import APIStatusError, AsyncOpenAI

from app.core.usage_meter import record_openai_response
from app.services.rag.config import OCRConfig

logger = logging.getLogger(__name__)

OCR_PROMPT = (
    "你是一个文字识别（OCR）引擎。请把这张文档页面图片中的全部文字原样转写出来：\n"
    "- 逐字照录，保持原文语言、数字、单位、符号和阅读顺序，不要翻译、总结、解释或补充；\n"
    "- 表格转写为 Markdown 表格，保留表头和每一行、每一列；合并单元格按其内容在相应行重复填写；\n"
    "- 标题用 Markdown 标题（#、##）标记，段落之间空一行；\n"
    "- 看不清的字用 □ 代替，不要猜测；页面没有任何文字时只输出空字符串；\n"
    "- 只输出转写结果本身，不要输出任何说明或代码块标记。"
)


class ImageDescriber(Protocol):
    """Turns an image into text; the PDF parser's OCR fallback depends only on this."""

    async def describe(self, image_bytes: bytes, mime_type: str) -> str: ...


class VisionOCRDescriber:
    """Transcribe page images with an OpenAI-compatible vision chat model."""

    def __init__(self, config: OCRConfig, client: AsyncOpenAI | None = None) -> None:
        self.config = config
        # Ollama ignores the key, but the SDK refuses an empty one.
        self._client = client or AsyncOpenAI(
            base_url=config.base_url,
            api_key=config.api_key or "not-needed",
            timeout=config.timeout_seconds,
            max_retries=2,
        )

    async def describe(self, image_bytes: bytes, mime_type: str) -> str:
        data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        response = await self._client.chat.completions.create(
            model=self.config.model,
            temperature=0,
            max_tokens=self.config.max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": OCR_PROMPT},
                    ],
                }
            ],
        )
        record_openai_response(response)
        return _strip_code_fence(response.choices[0].message.content or "")


def _strip_code_fence(text: str) -> str:
    """Some vision models wrap the whole transcription in a ```markdown fence despite the prompt."""
    stripped = text.strip()
    if stripped.startswith("```") and stripped.endswith("```"):
        lines = stripped.splitlines()
        return "\n".join(lines[1:-1]).strip()
    return stripped


_WORD_RE = re.compile(r"[0-9A-Za-z\u4e00-\u9fff]")


def has_words(text: str) -> bool:
    """True when a transcription contains any letter, digit or CJK character."""
    return bool(_WORD_RE.search(text))


def describe_ocr_error(error: BaseException) -> str:
    """Short, readable reason for a failed OCR call (the provider's message, not its raw JSON)."""
    if isinstance(error, APIStatusError):
        body = error.body if isinstance(error.body, dict) else {}
        detail = body.get("error", body)
        message = detail.get("message") if isinstance(detail, dict) else None
        return f"视觉模型返回 {error.status_code}：{message or error.message}"[:200]
    return (str(error).strip() or type(error).__name__)[:200]


def build_image_describer(config: OCRConfig) -> ImageDescriber | None:
    """The configured OCR describer, or None when OCR is off or no vision model is set."""
    if not config.enabled:
        return None
    if not config.model:
        logger.warning(
            "RAG_ENABLE_OCR is on but RAG_OCR_MODEL is empty; scanned pages will not be OCR'd"
        )
        return None
    return VisionOCRDescriber(config)

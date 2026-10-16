"""A CJK TrueType font for PDF text and chart labels (PostScript-outline fonts such as Noto CJK do not work)."""

from __future__ import annotations

import os
from functools import lru_cache

from app.core.config import settings

_CANDIDATES = (
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",  # fonts-wqy-microhei (Docker image)
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",  # macOS
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
)


@lru_cache(maxsize=1)
def cjk_font_path() -> str | None:
    for path in (settings.REPORT_FONT_PATH, *_CANDIDATES):
        if path and os.path.exists(path):
            return path
    return None

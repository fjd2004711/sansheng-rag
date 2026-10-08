"""Current-date text for prompts, in the configured timezone."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import settings

_WEEKDAYS = "一二三四五六日"


def today_zh(now: datetime | None = None) -> str:
    """Return e.g. ``2026年10月8日 星期四`` in ``settings.TIMEZONE``."""
    current = now or datetime.now(ZoneInfo(settings.TIMEZONE))
    return f"{current.year}年{current.month}月{current.day}日 星期{_WEEKDAYS[current.weekday()]}"

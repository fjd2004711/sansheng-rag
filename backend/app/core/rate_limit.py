"""In-memory sliding-window limiter for turns that spend the server's own model quota."""

import time
from collections import defaultdict, deque
from collections.abc import Callable

MINUTE = 60.0
DAY = 86400.0


class TurnRateLimiter:
    """Per-key limits over a minute and a day. State is per process (fine for a single backend)."""

    def __init__(
        self,
        per_minute: int,
        per_day: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.per_minute = per_minute
        self.per_day = per_day
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> float | None:
        """Record a hit and return None, or return seconds until allowed (and record nothing)."""
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= DAY:
            hits.popleft()
        if self.per_day and len(hits) >= self.per_day:
            return DAY - (now - hits[0])
        recent = [t for t in hits if now - t < MINUTE]
        if self.per_minute and len(recent) >= self.per_minute:
            return MINUTE - (now - recent[0])
        hits.append(now)
        return None

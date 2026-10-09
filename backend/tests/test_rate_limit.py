from app.core.rate_limit import TurnRateLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_blocks_after_per_minute_limit_then_recovers() -> None:
    clock = Clock()
    limiter = TurnRateLimiter(2, 100, clock)
    assert limiter.check("u") is None
    assert limiter.check("u") is None
    wait = limiter.check("u")
    assert wait is not None and 0 < wait <= 60
    clock.now += 61
    assert limiter.check("u") is None


def test_users_are_limited_independently() -> None:
    limiter = TurnRateLimiter(1, 100, Clock())
    assert limiter.check("a") is None
    assert limiter.check("b") is None
    assert limiter.check("a") is not None


def test_daily_cap_applies_and_rejected_hits_are_not_counted() -> None:
    clock = Clock()
    limiter = TurnRateLimiter(100, 2, clock)
    limiter.check("u")
    limiter.check("u")
    assert limiter.check("u") is not None
    clock.now += 86401
    assert limiter.check("u") is None


def test_zero_disables_a_limit() -> None:
    limiter = TurnRateLimiter(0, 0, Clock())
    assert all(limiter.check("u") is None for _ in range(50))

"""Pure helpers for the P5 evaluation: multi-phrase ranks and bootstrap confidence intervals."""

from __future__ import annotations

import random
from collections.abc import Sequence


def rank_for_all(contents: Sequence[str], phrases: Sequence[str]) -> int | None:
    """1-based rank at which *every* phrase has appeared in ``contents`` (the worst phrase decides).

    A multi-hop question is only answerable when all its supporting facts were retrieved, so a missing
    phrase means no rank. With no phrases (an abstention case) there is no rank either.
    """
    wanted = [p for p in phrases if p]
    if not wanted:
        return None
    lowered = [c.lower() for c in contents]
    ranks: list[int] = []
    for phrase in wanted:
        rank = next((i for i, text in enumerate(lowered, 1) if phrase.lower() in text), None)
        if rank is None:
            return None
        ranks.append(rank)
    return max(ranks)


def bootstrap_ci(
    values: Sequence[float], *, resamples: int = 1000, confidence: float = 0.95, seed: int = 7
) -> tuple[float, float]:
    """Percentile bootstrap interval of the mean. With one value the interval is that value."""
    if not values:
        return (0.0, 0.0)
    if len(values) == 1:
        return (float(values[0]), float(values[0]))
    rng = random.Random(seed)
    n = len(values)
    means = sorted(sum(rng.choices(values, k=n)) / n for _ in range(resamples))
    low = means[int(((1 - confidence) / 2) * (resamples - 1))]
    high = means[int((1 - (1 - confidence) / 2) * (resamples - 1))]
    return (round(low, 4), round(high, 4))

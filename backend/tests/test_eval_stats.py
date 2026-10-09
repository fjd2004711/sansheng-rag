import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))

from eval_stats import bootstrap_ci, rank_for_all


def test_multi_hop_needs_every_phrase_and_ranks_by_the_worst() -> None:
    docs = ["noise", "has ALPHA-1", "noise", "has BETA-2"]
    assert rank_for_all(docs, ["ALPHA-1", "BETA-2"]) == 4
    assert rank_for_all(docs, ["alpha-1"]) == 2
    assert rank_for_all(docs, ["ALPHA-1", "MISSING"]) is None
    assert rank_for_all(docs, []) is None


def test_bootstrap_interval_brackets_the_mean_and_is_reproducible() -> None:
    values = [1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0]
    low, high = bootstrap_ci(values)
    assert low <= sum(values) / len(values) <= high and low < high
    assert bootstrap_ci(values) == (low, high)
    assert bootstrap_ci([1.0]) == (1.0, 1.0) and bootstrap_ci([]) == (0.0, 0.0)

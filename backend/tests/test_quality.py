from app.services.quality import derive_verdict, last_assessment, percentile


def ev(step, status="X", **detail):
    return {"step": step, "round": 1, "status": status, "detail": detail}


def test_verdict_matches_the_ui_rules() -> None:
    assert derive_verdict([ev("retrieve"), ev("answer_verify", "PASS")]) == "verified"
    assert derive_verdict([ev("query_rewrite"), ev("answer_verify", "PASS")]) == "corrected"
    assert derive_verdict([ev("answer_verify", "FAIL"), ev("partial_answer")]) == "partial"
    assert derive_verdict([ev("abstain")]) == "abstained"
    assert derive_verdict([ev("retrieve")]) == "unchecked"
    # partial wins over abstain, as in the UI
    assert derive_verdict([ev("abstain"), ev("partial_answer")]) == "partial"


def test_last_assessment_is_the_latest_verification() -> None:
    trace = [ev("answer_verify", groundedness=0.2), ev("answer_reverify", groundedness=0.9)]
    assert last_assessment(trace)["groundedness"] == 0.9
    assert last_assessment([ev("retrieve")]) == {}


def test_percentile_handles_small_and_empty_samples() -> None:
    assert percentile([], 0.5) is None
    assert percentile([4.0], 0.9) == 4.0
    assert percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5) == 6

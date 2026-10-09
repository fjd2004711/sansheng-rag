from app.services.insights import classify, retrieved_sources


def ev(step, **detail):
    return {"step": step, "round": 1, "status": "X", "detail": detail}


def test_abstain_beats_partial_and_reason_comes_from_the_latest_explanation() -> None:
    trace = [
        ev("failure_diagnose", failure_reason="没找到"),
        ev("abstain", reason="库里没有"),
        ev("partial_answer"),
    ]
    assert classify(trace) == ("abstained", "库里没有")


def test_partial_and_clean_answers() -> None:
    assert classify([ev("partial_answer", reason="只覆盖一部分")])[0] == "partial"
    assert classify([ev("retrieve"), ev("answer_verify")]) == (None, None)


def test_sources_collected_from_all_retrieval_steps_once_each() -> None:
    trace = [
        ev("retrieve", results=[{"source": "a.pdf"}, {"source": "a.pdf"}, {"source": "b.md"}]),
        ev("retrieve_missing", results=[{"source": "c.txt"}]),
        ev("evidence_evaluate", results=[{"source": "ignored.txt"}]),
    ]
    assert retrieved_sources(trace) == {"a.pdf", "b.md", "c.txt"}

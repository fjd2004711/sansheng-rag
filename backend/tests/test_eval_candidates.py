import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.exceptions import BadRequestError
from app.schemas.eval_candidate import EvalCandidateCreate
from app.services.eval_candidate import EvalCandidateService, to_scenario_line


@pytest.mark.anyio
async def test_a_candidate_needs_an_expected_phrase_unless_it_should_abstain() -> None:
    service = EvalCandidateService(
        MagicMock(add=MagicMock(), flush=AsyncMock(), refresh=AsyncMock())
    )
    with pytest.raises(BadRequestError):
        await service.create(EvalCandidateCreate(question="q"), user_id=uuid4())
    created = await service.create(EvalCandidateCreate(question="q", abstain=True), user_id=uuid4())
    assert created.abstain


def test_export_line_matches_the_scenario_format_and_abstentions_have_no_phrase() -> None:
    answer = SimpleNamespace(
        id=uuid4(),
        question="退款?",
        expected_phrase="REFUND-9",
        abstain=False,
        failure_type="insufficient_evidence",
    )
    refuse = SimpleNamespace(
        id=uuid4(),
        question="火星?",
        expected_phrase="ignored",
        abstain=True,
        failure_type="insufficient_evidence",
    )
    a, r = json.loads(to_scenario_line(answer)), json.loads(to_scenario_line(refuse))
    assert set(a) == {
        "id",
        "question",
        "initial_query",
        "expected_phrase",
        "failure_type",
        "abstain",
    }
    assert a["expected_phrase"] == "REFUND-9" and a["initial_query"] == "退款?"
    assert (
        r["expected_phrase"] == "" and r["failure_type"] == "out_of_scope" and r["abstain"] is True
    )

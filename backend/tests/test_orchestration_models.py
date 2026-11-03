"""One model for a whole run, or a different model per agent."""

import pytest

from app.core.exceptions import BadRequestError
from app.core.llm_runtime import LLMRuntime
from app.schemas.orchestration import RunCreate
from app.services.orchestration.builtin import builtin_bundles
from app.services.orchestration.facade import OrchestrationService
from app.services.orchestration.spec import PolicySpec
from app.services.orchestration.state import ModelController

BASE = LLMRuntime(base_url="http://x", api_key="k", model="base-model")


def test_unified_model_replaces_the_default_and_an_agent_model_wins_over_it() -> None:
    models = ModelController(BASE, PolicySpec(model="unified"))
    assert models.runtime("strong").model == "unified"
    assert models.runtime("strong", "special").model == "special"
    assert models.current == "unified"


def test_fast_tier_uses_the_light_model_unless_the_agent_names_its_own() -> None:
    models = ModelController(BASE, PolicySpec(fast_model="light"))
    assert models.runtime("fast").model == "light"
    assert models.runtime("fast", "mine").model == "mine"
    assert models.runtime("strong").model == "base-model"


def test_agent_model_that_failed_is_dropped_for_the_rest_of_the_run() -> None:
    models = ModelController(BASE, PolicySpec(model="a", fallback_models=["b"]))
    assert models.runtime("strong", "a").model == "a"
    assert models.demote("quota")
    assert (
        models.runtime("strong", "a").model == "b"
    )  # "a" was dropped; the agent follows the run again


def test_run_models_are_written_into_a_copy_and_unknown_agents_are_rejected() -> None:
    bundle = builtin_bundles()["verified-report"]
    data = RunCreate(
        spec="verified-report", topic="主题", model="m-all", agent_models={"verifier": "m-check"}
    )
    out = OrchestrationService._with_models(bundle, data)
    assert out.workflow.policy.model == "m-all" and out.agents["verifier"].model == "m-check"
    assert (
        bundle.workflow.policy.model is None and bundle.agents["verifier"].model is None
    )  # original untouched
    with pytest.raises(BadRequestError):
        OrchestrationService._with_models(
            bundle, RunCreate(spec="verified-report", topic="主题", agent_models={"nobody": "m"})
        )

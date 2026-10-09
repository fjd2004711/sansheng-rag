import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.rag_settings import RagSettings
from app.services.app_settings import apply, read_current


def test_round_limits_are_capped_so_the_loop_stays_bounded() -> None:
    base = {
        "correction_enabled": True,
        "generation_correction_enabled": True,
        "reranker_enabled": True,
    }
    with pytest.raises(ValidationError):
        RagSettings(**base, max_correction_rounds=4, max_generation_corrections=1)
    with pytest.raises(ValidationError):
        RagSettings(**base, max_correction_rounds=0, max_generation_corrections=1)
    with pytest.raises(ValidationError):
        RagSettings(**base, max_correction_rounds=2, max_generation_corrections=3)


def test_apply_changes_the_live_settings_and_rag_config_follows() -> None:
    target = Settings()
    apply(
        RagSettings(
            correction_enabled=False,
            max_correction_rounds=3,
            generation_correction_enabled=False,
            max_generation_corrections=1,
            reranker_enabled=True,
        ),
        target,
    )
    assert read_current(target).max_correction_rounds == 3
    rag = target.rag
    assert rag.correction_config.enabled is False and rag.correction_config.max_rounds == 3
    assert rag.generation_correction_config.max_corrections == 1

from pydantic import Field

from app.schemas.base import BaseSchema


class RagSettings(BaseSchema):
    """The correction loop's knobs. Round limits are capped so the loop always stays bounded."""

    correction_enabled: bool
    max_correction_rounds: int = Field(ge=1, le=3)
    generation_correction_enabled: bool
    max_generation_corrections: int = Field(ge=1, le=2)
    reranker_enabled: bool

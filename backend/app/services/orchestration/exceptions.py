"""Domain errors of the orchestration platform."""

from app.core.exceptions import BadRequestError


class SpecError(BadRequestError):
    """A definition (agent, team, workflow, policy) is malformed or inconsistent."""


class BudgetExceededError(Exception):
    """The run spent its token or time budget; work that is not essential is cancelled."""

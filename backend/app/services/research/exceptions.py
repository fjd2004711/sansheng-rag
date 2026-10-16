"""Research-mode errors."""

from app.core.exceptions import BadRequestError, ExternalServiceError


class ResearchNotConfiguredError(ExternalServiceError):
    """No web search provider key is configured on the server."""


class WebSearchError(ExternalServiceError):
    """The search provider failed or returned an unusable response."""


class UnsafeURLError(BadRequestError):
    """A URL that must not be fetched (non-HTTP, or resolving to a private address)."""

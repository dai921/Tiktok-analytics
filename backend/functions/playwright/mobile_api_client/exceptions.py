class TikTokAPIError(Exception):
    """Raised when the TikTok mobile API returns an error response."""


class TokenExpiredError(TikTokAPIError):
    """Raised when the cached token appears to be invalid or expired."""


class SignatureGenerationError(TikTokAPIError):
    """Raised when X-Bogus (or similar) signature generation fails."""

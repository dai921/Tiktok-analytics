import re
from typing import Optional

_WHITESPACE_PATTERN = re.compile(r"\s+")
_BOOLEAN_RESERVED = set('+-@()<>~*:"&|')


def _sanitize_token(token: str) -> str:
    """Remove characters that have special meaning in BOOLEAN MODE."""
    return "".join(ch for ch in token if ch not in _BOOLEAN_RESERVED)


def prepare_fulltext_keyword(raw_keyword: Optional[str]) -> Optional[str]:
    """
    Normalize search keywords for BOOLEAN MODE (ngram) full-text queries.
    Returns strings like "+foo* +bar*" so MATCH ... AGAINST benefits from
    prefix matching while requiring every token to appear.
    """
    if raw_keyword is None:
        return None

    normalized = raw_keyword.strip()
    if not normalized:
        return None

    normalized = _WHITESPACE_PATTERN.sub(" ", normalized)
    clauses = []
    for token in normalized.split(" "):
        cleaned = _sanitize_token(token)
        if cleaned:
            clauses.append(f"+{cleaned}*")

    return " ".join(clauses) if clauses else None

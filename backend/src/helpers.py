#
# Small helpers shared across the API. No routes, no storage.
#

import re
from typing import Any

from fastapi import HTTPException

# Keys the API adds to responses; stripped from request bodies so they never get stored.
RESPONSE_ONLY_KEYS = ("id", "version", "created_at", "updated_at")


def slugify(name: str) -> str:
    """'Prosper Scheduler' -> 'prosper-scheduler'; empty or symbol-only -> 'agent'."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"


def strip_response_keys(data: dict[str, Any]) -> dict[str, Any]:
    """Drop the metadata a client may echo back from an earlier response."""
    return {k: v for k, v in data.items() if k not in RESPONSE_ONLY_KEYS}


def parse_if_match(value: str | None) -> int | None:
    """`If-Match: 3` or `If-Match: "3"` -> 3. Absent -> None (unconditional)."""
    if value is None:
        return None
    try:
        return int(value.strip().strip('"'))
    except ValueError as e:
        raise HTTPException(400, "If-Match must be an agent version number.") from e

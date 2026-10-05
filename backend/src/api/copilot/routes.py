#
# /api/copilot endpoints. HTTP only: validate the request, stream CopilotService's
# events back as NDJSON (one JSON object per line) so the editor can show each
# step as it happens.
#

import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from dependencies import get_copilot_service

from .service import CopilotService

router = APIRouter(prefix="/api/copilot", tags=["copilot"])

Copilot = Annotated[CopilotService, Depends(get_copilot_service)]


class CopilotMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CopilotFix(BaseModel):
    """A finding of a call's AI analysis to fix ("Fix with copilot")."""

    call_id: str
    node: str | None
    step: int | None
    cause: str
    suggestion: str


class CopilotGroupFix(BaseModel):
    """An issue group to fix across its calls ("Fix with copilot" in the Issues pane)."""

    kind: Literal["stuck", "long_stay", "error"]
    node: str | None
    version: int
    call_count: int = Field(ge=1)
    causes: list[str] = Field(min_length=1, max_length=50)
    """What the calls' AI analyses say caused it, one per call."""


class CopilotTurnRequest(BaseModel):
    agent: dict[str, Any]
    """The editor's working copy (unsaved edits included)."""
    messages: list[CopilotMessage] = Field(min_length=1)
    """The conversation so far, ending with the user's new prompt (for a fix, the finding as text)."""
    fix: CopilotFix | None = None
    """A fix turn: the finding to fix; the turn starts at the fix node."""
    group_fix: CopilotGroupFix | None = None
    """A group fix turn: an issue across calls; the turn starts at the group_fix node."""


@router.post("/turns")
async def run_turn(request: CopilotTurnRequest, copilot: Copilot) -> StreamingResponse:
    if request.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be the user's prompt.")
    if request.fix and request.group_fix:
        raise HTTPException(422, "Send either a fix or a group fix, not both.")

    async def lines() -> AsyncIterator[str]:
        messages = [message.model_dump() for message in request.messages]
        fix = request.fix.model_dump() if request.fix else None
        group_fix = request.group_fix.model_dump() if request.group_fix else None
        async for event in copilot.run_turn(request.agent, messages, fix, group_fix):
            yield json.dumps(event) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")

#
# An agent's stored calls, a sub-resource of the agent. HTTP only;
# CallRecordService does the work and shapes the responses.
#
#   GET /api/agents/{agent_id}/calls?limit=50     recent calls, newest first
#   GET /api/agents/{agent_id}/calls/{call_id}    one call: transcript, timeline, final state
#

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from api.calls.service import CallRecordService
from dependencies import get_call_record_service

router = APIRouter(prefix="/api/agents/{agent_id}/calls", tags=["calls"])

Calls = Annotated[CallRecordService, Depends(get_call_record_service)]


@router.get("")
def list_calls(
    agent_id: str,
    calls: Calls,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[dict[str, Any]]:
    """An agent's recent calls, newest first.

    :param agent_id: The agent whose calls to list.
    :param calls: The call record service.
    :param limit: At most this many calls, 1 to 200.
    :return: The calls, without their timelines.
    """
    return [CallRecordService.to_summary(call) for call in calls.list(agent_id, limit)]


@router.get("/{call_id}")
def get_call(agent_id: str, call_id: str, calls: Calls) -> dict[str, Any]:
    """One of an agent's calls in full: transcript, timeline and final state.

    :param agent_id: The agent the call belongs to.
    :param call_id: The call's id.
    :param calls: The call record service.
    :return: The call.
    """
    return CallRecordService.to_response(calls.get(agent_id, call_id))


#
# An agent's stored calls, a sub-resource of the agent. HTTP only;
# CallRecordService does the work and shapes the responses.
#
#   GET /api/agents/{agent_id}/calls?limit=50&outcome=…   recent calls, newest first
#                                                        (outcome repeatable: completed, abandoned, …)
#   GET /api/agents/{agent_id}/calls/{call_id}    one call: issues, steps, analysis, flags, transcript, …
#   POST /api/agents/{agent_id}/calls/{call_id}/flags   {reason} → 201: a customer flags the call;
#                                                        its AI analysis reruns in the background
#   GET /api/agents/{agent_id}/issues           the agent's issues across its calls, by version, and
#                                               how many are new since last seen
#   PATCH /api/agents/{agent_id}/issues         {seen: true}: mark them seen now → the updated issues
#

from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, StringConstraints

from api.calls.repository import Outcome
from api.calls.service import CallRecordService
from dependencies import get_call_record_service

router = APIRouter(prefix="/api/agents/{agent_id}/calls", tags=["calls"])

Calls = Annotated[CallRecordService, Depends(get_call_record_service)]


@router.get("")
def list_calls(
    agent_id: str,
    calls: Calls,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    outcome: Annotated[list[Outcome] | None, Query()] = None,
) -> list[dict[str, Any]]:
    """An agent's recent calls, newest first.

    :param agent_id: The agent whose calls to list.
    :param calls: The call record service.
    :param limit: At most this many calls, 1 to 200.
    :param outcome: Only calls that ended one of these ways (repeat the parameter
        for several); all calls when omitted. An unknown value is a 422.
    :return: The calls, without their timelines.
    """
    return [CallRecordService.to_summary(call) for call in calls.list(agent_id, limit, outcome)]


@router.get("/{call_id}")
def get_call(agent_id: str, call_id: str, calls: Calls) -> dict[str, Any]:
    """One of an agent's calls in full: transcript, timeline and final state.

    :param agent_id: The agent the call belongs to.
    :param call_id: The call's id.
    :param calls: The call record service.
    :return: The call.
    """
    return calls.to_response(calls.get(agent_id, call_id))



class FlagRequest(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    """What went wrong, in the customer's words."""


@router.post("/{call_id}/flags", status_code=201)
def flag_call(
    agent_id: str, call_id: str, request: FlagRequest, calls: Calls, background: BackgroundTasks
) -> dict[str, Any]:
    """Flag one of an agent's calls: a customer says something went wrong. The call's
    AI analysis goes back to pending and reruns after the response, with the flag.

    :param agent_id: The agent the call belongs to.
    :param call_id: The call's id.
    :param request: The reason.
    :param calls: The call record service.
    :param background: Where the reanalysis is scheduled.
    :return: The stored flag.
    """
    flag = calls.flag(agent_id, call_id, request.reason)
    background.add_task(calls.reanalyze, call_id)
    return CallRecordService.flag_response(flag)


issues_router = APIRouter(prefix="/api/agents/{agent_id}/issues", tags=["calls"])


@issues_router.get("")
def agent_issues(agent_id: str, calls: Calls) -> dict[str, Any]:
    """The agent's issues across its calls, divided by version, with what's new.

    :param agent_id: The agent.
    :param calls: The call record service.
    :return: ``{seen_at, new_count, versions}``.
    """
    return calls.issues(agent_id)


class IssuesPatch(BaseModel):
    seen: Literal[True]
    """Mark the issues seen now (the server stamps the time): only what happens after is new."""


@issues_router.patch("")
def update_issues(agent_id: str, patch: IssuesPatch, calls: Calls) -> dict[str, Any]:
    """Update the agent's issues: mark them seen (the Issues pane was opened).

    :param agent_id: The agent.
    :param patch: ``{seen: true}``.
    :param calls: The call record service.
    :return: The issues, as ``GET`` returns them, with nothing new.
    """
    calls.mark_issues_seen(agent_id)
    return calls.issues(agent_id)

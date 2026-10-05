#
# /api/agents endpoints. HTTP only: parse the request, call AgentService, shape
# the response. Errors raised below (not found, invalid, version conflict) become
# status codes via the handlers in main.py.
#

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Response
from fastapi.responses import JSONResponse

from dependencies import get_agent_service
from helpers import parse_if_match, strip_response_keys

from .repository import AgentRecord, AgentSummary
from .service import AgentService

router = APIRouter(prefix="/api/agents", tags=["agents"])

Service = Annotated[AgentService, Depends(get_agent_service)]
# The version the client last loaded; a stale one makes PUT/DELETE fail with 409.
IfMatch = Annotated[str | None, Header()]


@router.get("")
def list_agents(service: Service) -> list[dict[str, Any]]:
    return [_summary(s) for s in service.list()]


@router.get("/{agent_id}")
def get_agent(agent_id: str, service: Service) -> JSONResponse:
    return _agent(service.get(agent_id))


@router.post("", status_code=201)
def create_agent(data: dict[str, Any], service: Service) -> JSONResponse:
    return _agent(service.create(strip_response_keys(data)), status_code=201)


@router.put("/{agent_id}")
def update_agent(
    agent_id: str, data: dict[str, Any], service: Service, if_match: IfMatch = None
) -> JSONResponse:
    record = service.update(
        agent_id, strip_response_keys(data), expected_version=parse_if_match(if_match)
    )
    return _agent(record)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, service: Service, if_match: IfMatch = None) -> Response:
    service.delete(agent_id, expected_version=parse_if_match(if_match))
    return Response(status_code=204)


# ---- response shapes -------------------------------------------------------
def _agent(record: AgentRecord, status_code: int = 200) -> JSONResponse:
    """The agent document plus its metadata, with the version as ETag."""
    return JSONResponse(
        {
            "id": record.id,
            "version": record.version,
            "updated_at": record.updated_at.isoformat(),
            **record.body,
        },
        status_code=status_code,
        headers={"ETag": f'"{record.version}"'},
    )


def _summary(summary: AgentSummary) -> dict[str, Any]:
    return {
        "id": summary.id,
        "name": summary.name,
        "node_count": summary.node_count,
        "version": summary.version,
        "updated_at": summary.updated_at.isoformat(),
        "call_count": summary.call_count,
        "last_call_at": summary.last_call_at.isoformat() if summary.last_call_at else None,
    }

#
# Agent API — CRUD over stored agents, for the Composer UI (frontend/).
#
# Storage goes through one AgentRepository (storage/), created when the app starts
# and handed to routes with Depends (tests swap it via create_app(...) or
# app.dependency_overrides). Every save is validated by AgentBuilder, i.e. the exact
# code bot.py runs, so the UI can never persist an agent the bot can't load.
#
# Concurrency: responses carry the agent's `version` (also as an ETag). Send it back
# in `If-Match` on PUT/DELETE; if someone saved in between you get 409, not a
# silent overwrite.
#
# Run:  uvicorn api:app --app-dir src --reload --port 8000   (from backend/; or `make api`)
#

import re
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from agent_builder import AgentBuilder
from storage import (
    SEED_SQL,
    AgentNotFound,
    AgentRecord,
    AgentRepository,
    VersionConflict,
    agents_db_path,
)

AGENT_ID_PATTERN = r"^[a-z0-9-]+$"

# Keys the API adds to responses; stripped from request bodies so they never get stored.
RESPONSE_ONLY_KEYS = ("id", "version", "created_at", "updated_at")


# ---- helpers ---------------------------------------------------------------
def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"


def validate_agent(body: dict[str, Any]) -> None:
    """Reject anything AgentBuilder (and therefore the bot) can't load."""
    try:
        AgentBuilder.from_dict(body)
    except KeyError as e:
        raise HTTPException(422, f"Missing required field {e}.") from e
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e)) from e


def clean_body(data: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in data.items() if k not in RESPONSE_ONLY_KEYS}


def parse_if_match(value: str | None) -> int | None:
    """`If-Match: 3` or `If-Match: "3"` -> 3. Absent -> None (unconditional)."""
    if value is None:
        return None
    try:
        return int(value.strip().strip('"'))
    except ValueError as e:
        raise HTTPException(400, "If-Match must be an agent version number.") from e


def to_response(record: AgentRecord, status_code: int = 200) -> JSONResponse:
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


# ---- app -------------------------------------------------------------------
def create_app(
    # The real database starts with the sample agent (storage/seed.sql) when empty.
    repository_factory: Callable[[], AgentRepository] = lambda: AgentRepository(
        agents_db_path(), seed=SEED_SQL
    ),
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.agents = repository_factory()
        yield

    app = FastAPI(title="Prosper Agent API", lifespan=lifespan)

    @app.exception_handler(AgentNotFound)
    async def not_found(_: Request, exc: AgentNotFound) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(VersionConflict)
    async def conflict(_: Request, exc: VersionConflict) -> JSONResponse:
        return JSONResponse(
            {
                "detail": "This agent was changed elsewhere since you opened it. "
                "Reload to get the latest version.",
                "current_version": exc.actual,
            },
            status_code=409,
        )

    _register_routes(app)
    return app


def get_repository(request: Request) -> AgentRepository:
    """The app's repository bean. Override in tests via app.dependency_overrides."""
    return request.app.state.agents


Repository = Annotated[AgentRepository, Depends(get_repository)]
IfMatch = Annotated[str | None, Header()]


def _register_routes(app: FastAPI) -> None:
    @app.get("/api/agents")
    def list_agents(agents: Repository) -> list[dict[str, Any]]:
        return [
            {
                "id": s.id,
                "name": s.name,
                "node_count": s.node_count,
                "version": s.version,
                "updated_at": s.updated_at.isoformat(),
            }
            for s in agents.list()
        ]

    @app.get("/api/agents/{agent_id}")
    def get_agent(agent_id: str, agents: Repository) -> JSONResponse:
        if not re.fullmatch(AGENT_ID_PATTERN, agent_id):
            raise AgentNotFound(agent_id)
        return to_response(agents.get(agent_id))

    @app.post("/api/agents", status_code=201)
    def create_agent(data: dict[str, Any], agents: Repository) -> JSONResponse:
        body = clean_body(data)
        validate_agent(body)
        return to_response(agents.create_unique(slugify(body.get("name", "")), body), 201)

    @app.put("/api/agents/{agent_id}")
    def update_agent(
        agent_id: str, data: dict[str, Any], agents: Repository, if_match: IfMatch = None
    ) -> JSONResponse:
        if not re.fullmatch(AGENT_ID_PATTERN, agent_id):
            raise AgentNotFound(agent_id)
        body = clean_body(data)
        validate_agent(body)
        record = agents.update(agent_id, body, expected_version=parse_if_match(if_match))
        return to_response(record)

    @app.delete("/api/agents/{agent_id}", status_code=204)
    def delete_agent(agent_id: str, agents: Repository, if_match: IfMatch = None) -> Response:
        if not re.fullmatch(AGENT_ID_PATTERN, agent_id):
            raise AgentNotFound(agent_id)
        agents.delete(agent_id, expected_version=parse_if_match(if_match))
        return Response(status_code=204)


app = create_app()

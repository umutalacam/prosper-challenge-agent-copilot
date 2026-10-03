#
# Entry point of the Agent API — the FastAPI app for the Composer UI (frontend/).
#
#   api/agents/routes.py            HTTP: routes, headers, status codes
#   api/agents/service.py     rules: validation (AgentBuilder), ids
#   api/agents/repository.py  SQLite
#   dependencies.py                 the shared instances, injected with Depends
#
# Every save is validated by AgentBuilder, the exact code bot.py runs, so the UI
# can never persist an agent the bot can't load.
#
# Concurrency: responses carry the agent's `version` (also as an ETag). Send it back
# in `If-Match` on PUT/DELETE; if someone saved in between you get 409, not a
# silent overwrite.
#
# Run:  uvicorn main:app --app-dir src --reload --port 8000   (from backend/; or `make api`)
#

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.agents.repository import AgentNotFound, VersionConflict
from api.agents.service import InvalidAgent
from api.agents.routes import router as agents_router
from dependencies import get_agent_repository


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Open the database (schema + seed) at startup instead of on the first request.
    # Honors a test's override, so tests never touch the real database file.
    app.dependency_overrides.get(get_agent_repository, get_agent_repository)()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Prosper Agent API", lifespan=lifespan)
    _register_error_handlers(app)
    app.include_router(agents_router)
    return app


def _register_error_handlers(app: FastAPI) -> None:
    """Map domain errors to HTTP responses, in one place."""

    @app.exception_handler(AgentNotFound)
    async def not_found(_: Request, exc: AgentNotFound) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(InvalidAgent)
    async def invalid(_: Request, exc: InvalidAgent) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=422)

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


app = create_app()

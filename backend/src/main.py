#
# Entry point of the backend: the Agent API for the Composer UI (frontend/) and
# the voice bot that calls test agents, in one FastAPI app.
#
#   api/agents/routes.py      HTTP: routes, headers, status codes
#   api/agents/service.py     rules: validation (AgentBuilder), ids
#   api/agents/repository.py  SQLite
#   api/bot/                  voice calls: /api/bot (which agent answers), WebRTC
#                             signaling, and the prebuilt voice client at /client
#   dependencies.py           the shared instances, injected with Depends
#
# Every save is validated by AgentBuilder, the exact code the voice pipeline runs,
# so the UI can never persist an agent the bot can't load.
#
# Concurrency: responses carry the agent's `version` (also as an ETag). Send it back
# in `If-Match` on PUT/DELETE; if someone saved in between you get 409, not a
# silent overwrite.
#
# Run:  uvicorn main:app --app-dir src --reload --port 7860   (from backend/; or `make api`)
#       then talk to an agent at http://localhost:7860/client
#

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pipecat_ai_prebuilt.frontend import PipecatPrebuiltUI

from api.agents.repository import AgentNotFound, VersionConflict
from api.agents.service import InvalidAgent
from api.agents.routes import router as agents_router
from api.bot.routes import CLIENT_PATH, router as bot_router, webrtc_router
from config import BACKEND_DIR
from dependencies import get_agent_repository, get_agent_service, get_bot_service

# OPENAI_API_KEY, ELEVENLABS_API_KEY for the voice pipeline.
load_dotenv(BACKEND_DIR / ".env", override=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Open the database (schema + seed) at startup instead of on the first request.
    # Honors a test's override, so tests never touch the real database file.
    repository = app.dependency_overrides.get(get_agent_repository, get_agent_repository)()
    # The same cached instance the routes get through Depends.
    bot = get_bot_service(get_agent_service(repository))
    yield
    await bot.close()  # hang up calls in progress


def create_app() -> FastAPI:
    app = FastAPI(title="Prosper Agent API", lifespan=lifespan)
    _register_error_handlers(app)
    app.include_router(agents_router)
    app.include_router(bot_router)
    app.include_router(webrtc_router)
    app.mount(CLIENT_PATH.rstrip("/"), PipecatPrebuiltUI)

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse(CLIENT_PATH)

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

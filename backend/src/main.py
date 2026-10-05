#
# Entry point of the backend: the Agent API for the Composer UI (frontend/) and
# the voice bot that calls test agents, in one FastAPI app.
#
#   api/agents/routes.py      HTTP: routes, headers, status codes
#   api/agents/service.py     rules: validation (AgentBuilder), ids
#   api/agents/repository.py  SQLite
#   api/bot/                  voice calls: /api/bot (which agent answers), WebRTC
#                             signaling, and the prebuilt voice client at /client
#   api/copilot/              the AI copilot that edits an agent: /api/copilot/turns
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
from api.bot.service import NothingDeployed
from api.calls.repository import CallNotFound
from api.calls.routes import router as calls_router
from api.copilot.routes import router as copilot_router
from config import BACKEND_DIR
from dependencies import (
    get_agent_repository,
    get_agent_service,
    get_bot_service,
    get_copilot_analyzer,
    get_call_analyzer,
    get_call_record_service,
    get_call_repository,
    get_deployment_repository,
)

# OPENAI_API_KEY (voice pipeline + copilot), ELEVENLABS_API_KEY (voice pipeline).
load_dotenv(BACKEND_DIR / ".env", override=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the databases at startup instead of on the first request (honoring a
    test's overrides, so tests never touch the real files), and hang up calls in
    progress at shutdown.

    :param app: The app starting up.
    """
    repository = app.dependency_overrides.get(get_agent_repository, get_agent_repository)()
    call_repository = app.dependency_overrides.get(get_call_repository, get_call_repository)()
    deployments = app.dependency_overrides.get(get_deployment_repository, get_deployment_repository)()
    copilot_analyzer = app.dependency_overrides.get(get_copilot_analyzer, get_copilot_analyzer)()
    # The same cached instances the routes get through Depends. Keyword arguments,
    # as FastAPI passes them: lru_cache keys f(x) and f(name=x) apart.
    agents = get_agent_service(repository=repository)
    call_records = get_call_record_service(
        repository=call_repository, agents=agents, analyzer=get_call_analyzer(), copilot_analyzer=copilot_analyzer
    )
    bot = get_bot_service(agents=agents, call_records=call_records, deployments=deployments)
    yield
    await bot.close()  # hang up calls in progress


def create_app() -> FastAPI:
    """The API and the voice bot: routers, error mapping, and the prebuilt voice client at /client.

    :return: The configured app.
    """
    app = FastAPI(title="Prosper Agent API", lifespan=lifespan)
    _register_error_handlers(app)
    app.include_router(agents_router)
    app.include_router(bot_router)
    app.include_router(calls_router)
    app.include_router(copilot_router)
    app.include_router(webrtc_router)
    app.mount(CLIENT_PATH.rstrip("/"), PipecatPrebuiltUI)

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        """:return: A redirect to the voice client."""
        return RedirectResponse(CLIENT_PATH)

    return app


def _register_error_handlers(app: FastAPI) -> None:
    """Map domain errors to HTTP responses, in one place.

    :param app: The app to register the handlers on.
    """

    @app.exception_handler(AgentNotFound)
    @app.exception_handler(CallNotFound)
    async def not_found(_: Request, exc: AgentNotFound | CallNotFound) -> JSONResponse:
        """A missing agent or call is a 404.

        :param exc: The error; its message is the detail.
        :return: The 404 response.
        """
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(InvalidAgent)
    async def invalid(_: Request, exc: InvalidAgent) -> JSONResponse:
        """An agent AgentBuilder rejects is a 422.

        :param exc: The error; its message is the detail.
        :return: The 422 response.
        """
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(NothingDeployed)
    async def nothing_deployed(_: Request, exc: NothingDeployed) -> JSONResponse:
        """A call with no agent deployed is a 409: deploy one first.

        :param exc: The error; its message is the detail.
        :return: The 409 response.
        """
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(VersionConflict)
    async def conflict(_: Request, exc: VersionConflict) -> JSONResponse:
        """A save based on a stale version is a 409, with the current version.

        :param exc: The error, carrying the current version.
        :return: The 409 response.
        """
        return JSONResponse(
            {
                "detail": "This agent was changed elsewhere since you opened it. "
                "Reload to get the latest version.",
                "current_version": exc.actual,
            },
            status_code=409,
        )


app = create_app()

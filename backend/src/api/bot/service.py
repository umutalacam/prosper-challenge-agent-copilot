#
# BotService — runs voice calls inside the API process. Each WebRTC connection
# gets its own pipeline task, with the agent resolved when the call connects:
#
#   the /start body's agent_id   that agent's latest saved version (a per-call test)
#   else the deployment          the version deployed last (PUT /api/bot), from the database
#
# Deploying pins a version: saving edits changes nothing for callers until the
# agent is deployed again. Deployments are stored, so a restart keeps the live
# agent. Deploying never interrupts calls in progress; the next call gets the new
# version. With nothing deployed, a call is refused (NothingDeployed).
#

import asyncio
import uuid
from typing import Any

from loguru import logger
from pipecat.runner.types import SmallWebRTCRunnerArguments
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from agent_builder import AgentBuilder
from api.agents.repository import AgentVersion
from api.agents.service import AgentService
from api.bot.pipeline import run_call
from api.bot.repository import Deployment, DeploymentRepository
from api.calls.service import CallRecordService


class NothingDeployed(Exception):
    """A call came in, but no agent is deployed to answer it."""

    def __init__(self) -> None:
        """Say what to do about it."""
        super().__init__("No agent is deployed. Deploy one to take calls.")


class BotService:
    def __init__(
        self,
        agents: AgentService,
        call_records: CallRecordService,
        deployments: DeploymentRepository,
    ) -> None:
        """Set up the bot; it reads what's deployed from the database on every call.

        :param agents: Where calls' agents are loaded from.
        :param call_records: Where every finished call is stored.
        :param deployments: Which agent version is live.
        """
        self._agents = agents
        self._call_records = call_records
        self._deployments = deployments
        self._webrtc = SmallWebRTCRequestHandler()
        self._sessions: dict[str, dict[str, Any]] = {}  # /start body, until its offer arrives
        self._calls: set[asyncio.Task[None]] = set()

    @property
    def deployment(self) -> Deployment | None:
        """The live deployment (read from the database); None if nothing is deployed."""
        return self._deployments.current()

    @property
    def active_calls(self) -> int:
        """How many calls are running now."""
        return len(self._calls)

    def deploy(self, agent_id: str) -> Deployment:
        """Deploy an agent's current saved version; new calls get it, calls in
        progress keep theirs.

        :param agent_id: The agent to deploy.
        :return: The new deployment.
        :raises AgentNotFound: If there's no such agent (nothing changes).
        """
        record = self._agents.get(agent_id)
        deployment = self._deployments.record(AgentVersion(agent_id, record.version))
        logger.info(f"Deployed agent '{agent_id}' v{record.version}; it answers new calls")
        return deployment

    def load(self, agent_id: str | None = None) -> tuple[AgentBuilder, AgentVersion]:
        """The agent for a new call: ``agent_id``'s latest saved version if the call
        names one, else the deployed version.

        :param agent_id: The agent the call asked for, if any.
        :return: The compiled agent, and which saved version it is.
        :raises AgentNotFound: If the agent asked for doesn't exist.
        :raises NothingDeployed: If the call names none and nothing is deployed.
        """
        if agent_id:
            record = self._agents.get(agent_id)
        else:
            deployment = self.deployment
            if deployment is None:
                raise NothingDeployed()
            record = self._agents.get_version(deployment.agent.agent_id, deployment.agent.version)
        logger.info(f"Loaded agent '{record.id}' v{record.version} for a call")
        return AgentBuilder.from_dict(record.body), AgentVersion(record.id, record.version)

    # WebRTC signaling, as the prebuilt client speaks it: POST /start, then the
    # SDP offer and ICE candidates on /sessions/{id}/api/offer.

    def start(self, body: dict[str, Any]) -> str:
        """Open a session for the prebuilt client's ``POST /start``.

        :param body: The request body (may name an ``agent_id``), kept until the offer arrives.
        :return: The new session id.
        """
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = body
        return session_id

    async def offer(self, session_id: str | None, request: SmallWebRTCRequest) -> dict[str, str] | None:
        """Answer a WebRTC offer and, once connected, run the call in its own task.
        The agent is loaded first, so a missing one fails the request, not the call.

        :param session_id: The session from ``start``; None for a bare offer.
        :param request: The SDP offer.
        :return: The SDP answer.
        :raises AgentNotFound: If the session's agent doesn't exist.
        :raises NothingDeployed: If the session names no agent and nothing is deployed.
        """
        body = self._sessions.pop(session_id, {}) if session_id else {}
        body = body or request.request_data or {}
        # Load before answering, so a missing agent fails the request (404), not the call.
        builder, version = self.load(body.get("agent_id"))

        async def on_connection(connection: SmallWebRTCConnection) -> None:
            """The connection is up: start the call's pipeline task.

            :param connection: The call's WebRTC connection.
            """
            runner_args = SmallWebRTCRunnerArguments(
                webrtc_connection=connection, body=body, session_id=session_id
            )
            task = asyncio.create_task(run_call(runner_args, builder, version, self._call_records))
            self._calls.add(task)
            task.add_done_callback(self._calls.discard)

        return await self._webrtc.handle_web_request(request, on_connection)

    async def patch(self, request: SmallWebRTCPatchRequest) -> None:
        """Add ICE candidates to a connection being set up.

        :param request: The connection's id and its candidates.
        """
        await self._webrtc.handle_patch_request(request)

    async def close(self) -> None:
        """On shutdown: hang up every call and close the WebRTC handler."""
        for task in self._calls:
            task.cancel()
        await asyncio.gather(*self._calls, return_exceptions=True)
        await self._webrtc.close()

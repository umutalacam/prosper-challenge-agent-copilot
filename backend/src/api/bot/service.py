#
# BotService — runs voice calls inside the API process. Each WebRTC connection
# gets its own pipeline task, with the agent resolved when the call connects:
#
#   the /start body's agent_id   (per call — what a "Test call" button sends)
#   else the default agent       (PUT /api/bot; starts as the AGENT_ID env var)
#   else the AGENT_FLOW file     (relative to backend/, default example_flow.json)
#
# Switching the default never restarts anything: calls in progress keep their
# agent, the next call loads the new one. Agents are read fresh from the database
# per call, so edits saved in the UI apply to the next call too.
#

import asyncio
import os
import uuid
from pathlib import Path
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
from api.calls.service import CallRecordService
from config import BACKEND_DIR


class BotService:
    def __init__(self, agents: AgentService, call_records: CallRecordService) -> None:
        """:param agents: Where calls' agents are loaded from.
        :param call_records: Where every finished call is stored.
        """
        self._agents = agents
        self._call_records = call_records  # every call is saved when it ends
        self._agent_id: str | None = os.getenv("AGENT_ID") or None
        self._agent_flow: Path = BACKEND_DIR / os.getenv("AGENT_FLOW", "example_flow.json")
        self._webrtc = SmallWebRTCRequestHandler()
        self._sessions: dict[str, dict[str, Any]] = {}  # /start body, until its offer arrives
        self._calls: set[asyncio.Task[None]] = set()

    @property
    def agent_id(self) -> str | None:
        """The default agent for new calls; None runs the AGENT_FLOW file."""
        return self._agent_id

    @property
    def active_calls(self) -> int:
        """How many calls are running now."""
        return len(self._calls)

    def set_agent(self, agent_id: str) -> None:
        """Make an agent the default for new calls; calls in progress keep theirs.

        :param agent_id: The agent to answer new calls with.
        :raises AgentNotFound: If there's no such agent (the default stays).
        """
        self._agents.get(agent_id)
        self._agent_id = agent_id
        logger.info(f"Voice bot now answers new calls with agent '{agent_id}'")

    def load(self, agent_id: str | None = None) -> tuple[AgentBuilder, AgentVersion | None]:
        """The agent for a new call: ``agent_id``, else the default, else the AGENT_FLOW
        file. Read fresh, so saved edits apply to the next call.

        :param agent_id: The agent the call asked for, if any.
        :return: The compiled agent, and which saved version it is (None for the file).
        :raises AgentNotFound: If the agent asked for doesn't exist.
        """
        agent_id = agent_id or self._agent_id
        if agent_id:
            record = self._agents.get(agent_id)
            logger.info(f"Loaded agent '{agent_id}' v{record.version} from the database")
            return AgentBuilder.from_dict(record.body), AgentVersion(agent_id, record.version)
        return AgentBuilder.from_json(self._agent_flow), None

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

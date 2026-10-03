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
from api.agents.service import AgentService
from config import BACKEND_DIR

from .pipeline import run_call


class BotService:
    def __init__(self, agents: AgentService) -> None:
        self._agents = agents
        self._agent_id: str | None = os.getenv("AGENT_ID") or None
        self._agent_flow: Path = BACKEND_DIR / os.getenv("AGENT_FLOW", "example_flow.json")
        self._webrtc = SmallWebRTCRequestHandler()
        self._sessions: dict[str, dict[str, Any]] = {}  # /start body, until its offer arrives
        self._calls: set[asyncio.Task[None]] = set()

    @property
    def agent_id(self) -> str | None:
        return self._agent_id

    @property
    def active_calls(self) -> int:
        return len(self._calls)

    def set_agent(self, agent_id: str) -> None:
        """Make `agent_id` the default for new calls. Raises AgentNotFound."""
        self._agents.get(agent_id)
        self._agent_id = agent_id
        logger.info(f"Voice bot now answers new calls with agent '{agent_id}'")

    def load(self, agent_id: str | None = None) -> AgentBuilder:
        """The agent for a new call: `agent_id`, else the default, else AGENT_FLOW."""
        agent_id = agent_id or self._agent_id
        if agent_id:
            record = self._agents.get(agent_id)
            logger.info(f"Loaded agent '{agent_id}' v{record.version} from the database")
            return AgentBuilder.from_dict(record.body)
        return AgentBuilder.from_json(self._agent_flow)

    # WebRTC signaling, as the prebuilt client speaks it: POST /start, then the
    # SDP offer and ICE candidates on /sessions/{id}/api/offer.

    def start(self, body: dict[str, Any]) -> str:
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = body
        return session_id

    async def offer(self, session_id: str | None, request: SmallWebRTCRequest) -> dict[str, str] | None:
        body = self._sessions.pop(session_id, {}) if session_id else {}
        body = body or request.request_data or {}
        # Load before answering, so a missing agent fails the request (404), not the call.
        builder = self.load(body.get("agent_id"))

        async def on_connection(connection: SmallWebRTCConnection) -> None:
            runner_args = SmallWebRTCRunnerArguments(
                webrtc_connection=connection, body=body, session_id=session_id
            )
            task = asyncio.create_task(run_call(runner_args, builder))
            self._calls.add(task)
            task.add_done_callback(self._calls.discard)

        return await self._webrtc.handle_web_request(request, on_connection)

    async def patch(self, request: SmallWebRTCPatchRequest) -> None:
        await self._webrtc.handle_patch_request(request)

    async def close(self) -> None:
        """On shutdown: hang up every call."""
        for task in self._calls:
            task.cancel()
        await asyncio.gather(*self._calls, return_exceptions=True)
        await self._webrtc.close()

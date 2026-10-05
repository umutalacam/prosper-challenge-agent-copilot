#
# Voice bot endpoints. HTTP only; BotService does the work.
#
#   router         /api/bot      what's deployed (GET status, PUT deploy an agent's saved version)
#   webrtc_router  /start, /sessions/{id}/api/offer, /api/offer
#                  WebRTC signaling, the paths the prebuilt client (/client) calls
#

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
)

from dependencies import get_bot_service

from .service import BotService

CLIENT_PATH = "/client/"

router = APIRouter(prefix="/api/bot", tags=["bot"])
webrtc_router = APIRouter(tags=["webrtc"], include_in_schema=False)

Bot = Annotated[BotService, Depends(get_bot_service)]


@router.get("")
def get_bot(bot: Bot, request: Request) -> dict[str, Any]:
    """What's deployed and how many calls are live.

    :param bot: The voice bot.
    :param request: Used to build the voice client's URL.
    :return: The bot's status.
    """
    return _status(bot, request)


@router.put("")
def deploy(agent_id: Annotated[str, Body(embed=True)], bot: Bot, request: Request) -> dict[str, Any]:
    """Deploy an agent's current saved version; new calls get it.

    :param agent_id: The agent to deploy (the body's ``agent_id``).
    :param bot: The voice bot.
    :param request: Used to build the voice client's URL.
    :return: The bot's status, with the new deployment.
    """
    bot.deploy(agent_id)
    return _status(bot, request)


@webrtc_router.post("/start")
async def start(request: Request, bot: Bot) -> dict[str, Any]:
    """The prebuilt client's ``POST /start``: open a session for the offer that follows.

    :param request: Its JSON body; ``body`` may name an ``agent_id``.
    :param bot: The voice bot.
    :return: The session id, and STUN servers if the client asked for them.
    """
    data = await _json(request)
    result: dict[str, Any] = {"sessionId": bot.start(data.get("body") or {})}
    if data.get("enableDefaultIceServers"):
        result["iceConfig"] = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
    return result


@webrtc_router.post("/api/offer")
@webrtc_router.post("/sessions/{session_id}/api/offer")
async def offer(request: Request, bot: Bot, session_id: str | None = None) -> dict[str, str] | None:
    """The client's SDP offer; answering it starts the call once connected.

    :param request: The offer (``sdp``, ``type``, optional ``pc_id`` and ``request_data``).
    :param bot: The voice bot.
    :param session_id: The session from ``/start``; None on the bare ``/api/offer`` path.
    :return: The SDP answer.
    """
    data = await _json(request)
    _require(data, "sdp", "type")
    return await bot.offer(
        session_id,
        SmallWebRTCRequest(
            sdp=data["sdp"],
            type=data["type"],
            pc_id=data.get("pc_id"),
            restart_pc=data.get("restart_pc"),
            request_data=data.get("request_data") or data.get("requestData"),
        ),
    )


@webrtc_router.patch("/api/offer")
@webrtc_router.patch("/sessions/{session_id}/api/offer")
async def ice_candidates(request: Request, bot: Bot) -> dict[str, str]:
    """The client's ICE candidates for a connection being set up.

    :param request: The connection's ``pc_id`` and its ``candidates``.
    :param bot: The voice bot.
    :return: A success marker, as the client expects.
    """
    data = await _json(request)
    _require(data, "pc_id")
    await bot.patch(
        SmallWebRTCPatchRequest(
            pc_id=data["pc_id"],
            candidates=[IceCandidate(**c) for c in data.get("candidates", [])],
        )
    )
    return {"status": "success"}


def _status(bot: BotService, request: Request) -> dict[str, Any]:
    """The bot's status, as GET and PUT /api/bot return it.

    :param bot: The voice bot.
    :param request: Used to build the voice client's URL.
    :return: The deployment (agent, version, when; all None if nothing is deployed),
        the live call count and the client URL.
    """
    deployment = bot.deployment
    return {
        "agent_id": deployment.agent.agent_id if deployment else None,
        "version": deployment.agent.version if deployment else None,
        "deployed_at": deployment.deployed_at.isoformat() if deployment else None,
        "active_calls": bot.active_calls,
        "client_url": str(request.base_url) + CLIENT_PATH.lstrip("/"),
    }


async def _json(request: Request) -> dict[str, Any]:
    """A request's JSON body, tolerating a missing or malformed one.

    :param request: The request.
    :return: The body if it's a JSON object, else an empty dict.
    """
    try:
        data = await request.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _require(data: dict[str, Any], *keys: str) -> None:
    """Check that a signaling payload has the fields it needs.

    :param data: The payload.
    :param keys: The required field names.
    :raises HTTPException: 400, naming the missing fields.
    """
    missing = [key for key in keys if key not in data]
    if missing:
        raise HTTPException(400, f"Missing {', '.join(missing)}")

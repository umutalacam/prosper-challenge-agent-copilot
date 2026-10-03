#
# Voice bot endpoints. HTTP only; BotService does the work.
#
#   router         /api/bot      which agent answers new calls (GET status, PUT switch)
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
    return _status(bot, request)


@router.put("")
def set_bot_agent(
    agent_id: Annotated[str, Body(embed=True)], bot: Bot, request: Request
) -> dict[str, Any]:
    bot.set_agent(agent_id)
    return _status(bot, request)


@webrtc_router.post("/start")
async def start(request: Request, bot: Bot) -> dict[str, Any]:
    data = await _json(request)
    result: dict[str, Any] = {"sessionId": bot.start(data.get("body") or {})}
    if data.get("enableDefaultIceServers"):
        result["iceConfig"] = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
    return result


@webrtc_router.post("/api/offer")
@webrtc_router.post("/sessions/{session_id}/api/offer")
async def offer(request: Request, bot: Bot, session_id: str | None = None) -> dict[str, str] | None:
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
    return {
        "agent_id": bot.agent_id,
        "active_calls": bot.active_calls,
        "client_url": str(request.base_url) + CLIENT_PATH.lstrip("/"),
    }


async def _json(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _require(data: dict[str, Any], *keys: str) -> None:
    missing = [key for key in keys if key not in data]
    if missing:
        raise HTTPException(400, f"Missing {', '.join(missing)}")

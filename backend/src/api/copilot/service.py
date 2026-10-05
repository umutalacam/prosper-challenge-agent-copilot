#
# CopilotService — one copilot turn: the user's prompt + the editor's current agent
# in, a stream of events out. The turn runs through the node graph (graph.py):
# understand the request, then plan → build → review → wrap up, explain, or ask
# the user. A fix turn (a finding from a call's AI analysis) starts at the fix
# node instead and goes straight to plan → build → review → wrap up. Stateless:
# the browser keeps the conversation and sends it each turn.
#
# Events, in the order they can happen:
#   {"type": "activity", "text": "Planning…"}            what it's doing right now
#   {"type": "note", "text": "..."}                      the goal, or the model's own words mid-build
#   {"type": "step", "text": "Added node 'x'", "ok": true}   an edit (ok=false: refused)
#   {"type": "agent", "agent": {...}}                    the agent after that edit
#   {"type": "reply", "text": "..."}                     the turn's closing message
#   {"type": "questions", "questions": [{"question": "...", "options": [...]}]}
#   {"type": "error", "message": "..."}
#   {"type": "done"}
#

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from loguru import logger

from api.copilot.edits import AgentEdits
from api.copilot.graph import build_graph
from api.copilot.model import CopilotModel
from api.copilot.prompts import PromptLibrary
from api.copilot.turn import Event, Turn


class CopilotService:
    def __init__(self, client: Any, model: str, config_dir: Path) -> None:
        self._graph = build_graph(CopilotModel(client, model), PromptLibrary(config_dir))

    async def run_turn(
        self, agent: dict[str, Any], messages: list[dict[str, str]], fix: dict[str, Any] | None = None
    ) -> AsyncIterator[Event]:
        """`messages`: the conversation so far, ending with the user's new prompt (for a fix,
        the finding as text). `fix`: the finding to fix, which starts the turn at the fix node."""
        turn = Turn(AgentEdits(agent), messages, fix=fix)
        try:
            async for event in self._graph.run(turn, start="fix" if fix else None):
                yield event
        except Exception as error:  # the model call (network, auth, rate limit), the config or a bug
            logger.exception("Copilot turn failed")
            yield {"type": "error", "message": f"The copilot failed: {error}"}
        yield {"type": "done"}

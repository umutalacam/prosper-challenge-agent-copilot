#
# PlannerNode — turns the request (or the review's issues) into an ordered list of
# edits for the executor. The plan goes to the log, not the UI: the edits it
# leads to show as steps, and a full plan is too long for the card.
#

from typing import Any

from loguru import logger

from api.copilot.nodes.base import DecisionNode, bullets, numbered
from api.copilot.turn import Event, Turn


class PlannerNode(DecisionNode):
    name = "planner"
    activity = "Planning…"

    def context(self, turn: Turn) -> str | None:
        parts = []
        if turn.goal:
            parts.append(f"The user wants: {turn.goal}")
        if turn.issues:
            parts.append(
                "The review found these problems with the agent. Plan only the edits that fix them:\n"
                + bullets(turn.issues)
            )
        return "\n\n".join(parts) or None

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        turn.plan = [step for step in answer.get("steps") or [] if step]
        logger.info("Copilot plan:\n{}", numbered(turn.plan))
        return []

    def next(self, turn: Turn) -> str | None:
        return "executor"

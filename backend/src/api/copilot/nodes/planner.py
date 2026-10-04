#
# PlannerNode — turns the request (or the review's issues) into an ordered list of
# edits for the executor. Shows the plan as a note.
#

from typing import Any

from api.copilot.nodes.base import DecisionNode, bullets, numbered
from api.copilot.turn import Event, Turn


class PlannerNode(DecisionNode):
    name = "planner"
    activity = "Planning…"

    def context(self, turn: Turn) -> str | None:
        if not turn.issues:
            return None
        return "The review found these problems with the agent. Plan only the edits that fix them:\n" + bullets(
            turn.issues
        )

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        turn.plan = [step for step in answer.get("steps") or [] if step]
        if not turn.plan:
            return []
        return [{"type": "note", "text": "Plan:\n" + numbered(turn.plan)}]

    def next(self, turn: Turn) -> str | None:
        return "executor"

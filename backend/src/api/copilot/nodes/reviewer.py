#
# ReviewerNode — checks the built agent. First the code checks: an invalid agent
# (AgentBuilder's verdict) goes straight back to the planner, no model call. Then
# the model compares the agent with the request and the plan, with the
# completeness gaps as hints (they may be fine if the user asked for only part).
# Issues send the turn back to the planner, at most MAX_REVIEWS - 1 times.
#

from collections.abc import AsyncIterator
from typing import Any

from api.copilot.checks import completeness_gaps, validation_error
from api.copilot.nodes.base import DecisionNode, bullets, numbered
from api.copilot.turn import Event, Turn

MAX_REVIEWS = 3  # the first review plus at most two rounds of fixes


class ReviewerNode(DecisionNode):
    name = "reviewer"
    activity = "Reviewing…"

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        turn.reviews += 1
        error = validation_error(turn.agent)
        if error:
            yield self._activity()
            turn.issues = [f"The agent isn't valid: {error}"]
            return
        async for event in super().run(turn):
            yield event

    def context(self, turn: Turn) -> str | None:
        parts = []
        if turn.goal:
            parts.append(f"The user wants: {turn.goal}")
        if turn.plan:
            parts.append("The plan was:\n" + numbered(turn.plan))
        parts.append("Edits made this turn:\n" + bullets(turn.steps))
        gaps = completeness_gaps(turn.agent)
        if gaps:
            parts.append("Automatic checks found:\n" + bullets(gaps))
        return "\n\n".join(parts)

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        issues = [issue for issue in answer.get("issues") or [] if issue]
        turn.issues = [] if answer.get("ok") else issues
        return []

    def next(self, turn: Turn) -> str | None:
        return "planner" if turn.issues and turn.reviews < MAX_REVIEWS else "wrap_up"

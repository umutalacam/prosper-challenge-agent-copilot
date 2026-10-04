#
# WrapUpNode — the last node: sends the turn's reply. After a build it asks the
# model to summarize what changed (and what the review couldn't fix), and reports
# an agent that still isn't valid. A reply already written (by the explainer) is
# sent as it is, without a model call.
#

from collections.abc import AsyncIterator

from api.copilot.checks import validation_error
from api.copilot.nodes.base import TextNode, bullets, numbered
from api.copilot.turn import Event, Turn


class WrapUpNode(TextNode):
    name = "wrap_up"
    activity = "Wrapping up…"

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        if turn.reply is None:
            async for event in super().run(turn):
                yield event
        if turn.reply:
            yield {"type": "reply", "text": turn.reply}
        if turn.intent == "build":
            error = validation_error(turn.agent)
            if error:
                yield {"type": "error", "message": f"The agent still isn't valid: {error}"}

    def context(self, turn: Turn) -> str | None:
        parts = []
        if turn.plan:
            parts.append("The plan was:\n" + numbered(turn.plan))
        parts.append("Edits made this turn:\n" + bullets(turn.steps))
        if turn.issues:
            parts.append("Problems the review couldn't fix:\n" + bullets(turn.issues))
        return "\n\n".join(parts)

    def record(self, turn: Turn, text: str) -> list[Event]:
        turn.reply = text
        return []

    def next(self, turn: Turn) -> str | None:
        return None

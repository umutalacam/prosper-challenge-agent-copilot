#
# ExplainerNode — answers a question about the agent without changing it. Its
# answer is the turn's reply; wrap_up sends it.
#

from api.copilot.nodes.base import TextNode
from api.copilot.turn import Event, Turn


class ExplainerNode(TextNode):
    name = "explainer"
    activity = "Explaining…"

    def record(self, turn: Turn, text: str) -> list[Event]:
        turn.reply = text
        return []

    def next(self, turn: Turn) -> str | None:
        return "wrap_up"

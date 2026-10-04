#
# ResolveIntentNode — the first node: what does the newest message need?
# build → planner, explain → explainer, clarify → ask the user and end the turn.
#

from typing import Any

from api.copilot.nodes.base import DecisionNode
from api.copilot.turn import Event, Turn

MAX_QUESTIONS = 3

_NEXT = {"build": "planner", "explain": "explainer"}


class ResolveIntentNode(DecisionNode):
    name = "resolve_intent"
    activity = "Understanding the request…"

    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        turn.intent = answer.get("intent")
        if turn.intent != "clarify":
            return []
        turn.questions = [
            # The editor treats missing options as "no suggestions"; strict mode sends [].
            {"question": q["question"], **({"options": q["options"]} if q.get("options") else {})}
            for q in (answer.get("questions") or [])[:MAX_QUESTIONS]
            if q.get("question")
        ]
        return [{"type": "questions", "questions": turn.questions}] if turn.questions else []

    def next(self, turn: Turn) -> str | None:
        if turn.intent == "clarify":
            # Clarify with nothing to ask: answer instead of ending the turn silently.
            return None if turn.questions else "explainer"
        return _NEXT.get(turn.intent or "", "explainer")

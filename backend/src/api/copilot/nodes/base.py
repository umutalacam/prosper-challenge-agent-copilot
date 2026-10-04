#
# The copilot node contract and the three ways a node talks to the model.
#
#   CopilotNode    run(turn) does the work and yields events; next(turn) picks the
#                  next node by name from what run recorded (None ends the turn).
#   DecisionNode   one JSON answer matching the node's schema in schemas.json
#   ToolNode       a tool loop: the model calls tools until it's done
#   TextNode       one plain-text answer
#
# A concrete node subclasses one of the three and fills in only what's its own:
# `record` (what the answer means for the turn), `apply`/`tools` for tool nodes,
# `context` (what it needs from earlier nodes) and `next`.
#

import json
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, ClassVar

from loguru import logger

from api.copilot.model import CopilotModel
from api.copilot.prompts import PromptLibrary
from api.copilot.turn import Event, Turn


class CopilotNode(ABC):
    name: ClassVar[str]  # how other nodes refer to it, and its prompt file: config/copilot/<name>.md
    activity: ClassVar[str]  # shown while it runs ("Planning…")

    def __init__(self, model: CopilotModel, prompts: PromptLibrary) -> None:
        self.model = model
        self.prompts = prompts

    @abstractmethod
    def run(self, turn: Turn) -> AsyncIterator[Event]:
        """Do this node's work: call the model, record the result on `turn`, yield events."""

    @abstractmethod
    def next(self, turn: Turn) -> str | None:
        """The next node's name, from what `run` recorded; None ends the turn. No side effects."""

    def context(self, turn: Turn) -> str | None:
        """What this node's model call needs from earlier nodes, added after the prompt."""
        return None

    def _activity(self) -> Event:
        return {"type": "activity", "text": self.activity}


class DecisionNode(CopilotNode):
    """Asks the model for one JSON answer matching this node's schema in schemas.json."""

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        yield self._activity()
        chat = self.prompts.chat(self.name, turn, self.context(turn))
        answer = await self.model.decide(chat, self.name, self.prompts.schema(self.name))
        logger.info("Copilot {}: {}", self.name, answer.get("reason", ""))
        for event in self.record(turn, answer):
            yield event

    @abstractmethod
    def record(self, turn: Turn, answer: dict[str, Any]) -> list[Event]:
        """Store the answer on `turn`; return the events to show for it."""


class TextNode(CopilotNode):
    """Asks the model for one plain-text answer."""

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        yield self._activity()
        text = await self.model.say(self.prompts.chat(self.name, turn, self.context(turn)))
        for event in self.record(turn, text):
            yield event

    @abstractmethod
    def record(self, turn: Turn, text: str) -> list[Event]:
        """Store the answer on `turn`; return the events to show for it."""


class ToolNode(CopilotNode):
    """Lets the model call tools until it answers without one (or `max_rounds` runs out)."""

    max_rounds: ClassVar[int] = 15

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        chat = self.prompts.chat(self.name, turn, self.context(turn))
        tools = self.tools()
        for _ in range(self.max_rounds):
            yield self._activity()
            message = await self.model.act(chat, tools)
            calls = message.tool_calls or []
            chat.append(_assistant_message(message.content, calls))
            if not calls:
                logger.info("Copilot {} done: {}", self.name, message.content or "")
                return
            if message.content:
                yield {"type": "note", "text": message.content}
            for call in calls:
                result, events = self.apply(turn, call.function.name, _parse_args(call.function.arguments))
                for event in events:
                    yield event
                chat.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
        logger.warning("Copilot {} stopped after {} rounds", self.name, self.max_rounds)

    @abstractmethod
    def tools(self) -> list[dict[str, Any]]:
        """The tools the model may call, in OpenAI's function-tool format."""

    @abstractmethod
    def apply(self, turn: Turn, name: str, args: dict[str, Any]) -> tuple[dict[str, Any], list[Event]]:
        """Run one tool call: the result for the model, and the events to show for it."""


def numbered(items: list[str]) -> str:
    return "\n".join(f"{i}. {item}" for i, item in enumerate(items, 1))


def bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) or "- none"


def _assistant_message(content: str | None, calls: list[Any]) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if calls:
        message["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.function.name, "arguments": call.function.arguments},
            }
            for call in calls
        ]
    return message


def _parse_args(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}

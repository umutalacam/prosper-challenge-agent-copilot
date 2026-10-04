"""Stand-ins for the copilot tests: a scripted OpenAI client and its scripted answers."""

import asyncio
import json
from types import SimpleNamespace

from api.copilot.nodes import CopilotNode
from api.copilot.turn import Event, Turn

AGENT = {
    "name": "New agent",
    "initial_node": "greeting",
    "nodes": [{"name": "greeting", "task_messages": [], "edges": []}],
}


def call(tool: str, /, **args) -> SimpleNamespace:
    return SimpleNamespace(id=f"call_{tool}", function=SimpleNamespace(name=tool, arguments=json.dumps(args)))


def reply(content: str | None = None, *calls: SimpleNamespace) -> SimpleNamespace:
    """A model response: text (or a JSON answer), optionally with tool calls."""
    message = SimpleNamespace(content=content, tool_calls=list(calls) or None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def route(intent: str, *questions: dict, goal: str = "Build it") -> SimpleNamespace:
    return reply(json.dumps({"reason": "r", "intent": intent, "goal": goal, "questions": list(questions)}))


def plan(*steps: str) -> SimpleNamespace:
    return reply(json.dumps({"reason": "r", "steps": list(steps)}))


def review(*issues: str) -> SimpleNamespace:
    return reply(json.dumps({"reason": "r", "ok": not issues, "issues": list(issues)}))


class ScriptedModel:
    """Stands in for AsyncOpenAI: returns the scripted responses in order, records requests."""

    def __init__(self, *responses: SimpleNamespace) -> None:
        self.responses = list(responses)
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **request):
        self.requests.append(json.loads(json.dumps(request)))  # snapshot
        return self.responses.pop(0)


def run_node(node: CopilotNode, turn: Turn) -> list[Event]:
    async def collect():
        return [event async for event in node.run(turn)]

    return asyncio.run(collect())

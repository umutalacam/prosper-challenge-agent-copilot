#
# Turn — the state of one copilot turn, shared by the nodes as the graph runs.
# Each node reads what earlier nodes recorded and records its own result here;
# `CopilotNode.next` decides the next node from it.
#

from dataclasses import dataclass, field
from typing import Any

from api.copilot.edits import AgentEdits

Event = dict[str, Any]  # one line of the NDJSON stream (see service.py)


@dataclass
class Turn:
    edits: AgentEdits  # the agent being built; edits apply to edits.agent
    messages: list[dict[str, str]]  # the conversation, ending with the user's new prompt
    fix: dict[str, Any] | None = None  # a fix turn: the call-analysis finding {call_id, node, step, cause, suggestion}
    group_fix: dict[str, Any] | None = None  # a group fix: {kind, node, version, call_count, causes, proposal}
    intent: str | None = None  # resolve_intent: "build" | "explain" | "clarify"
    goal: str | None = None  # resolve_intent: what the user wants from this turn, one sentence
    questions: list[dict[str, Any]] = field(default_factory=list)  # resolve_intent, for clarify
    plan: list[str] = field(default_factory=list)  # planner: the edits to make, in order
    steps: list[str] = field(default_factory=list)  # executor: summaries of the edits applied
    issues: list[str] = field(default_factory=list)  # reviewer: what's still wrong
    reviews: int = 0  # reviewer: how many times it has run
    reply: str | None = None  # explainer / wrap_up: the turn's closing message

    @property
    def agent(self) -> dict[str, Any]:
        return self.edits.agent

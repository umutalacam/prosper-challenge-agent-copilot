#
# CopilotGraph — runs a turn through the copilot's nodes: start at `start`, run a
# node, ask it for the next one, until a node returns None. The graph knows nodes
# only as CopilotNode; which node follows which is each node's own `next`.
#
# A turn starts at resolve_intent (a typed prompt), at fix (a finding from a
# call's AI analysis, sent with "Fix with copilot"), or at group_fix (an issue
# across calls, from the Issues pane: it proposes one fix and asks the user, whose
# answer comes back as the next turn and builds through resolve_intent).
#
#                  ┌── clarify ──▶ (questions, turn ends)
# resolve_intent ──┼── build ──▶ planner ──▶ executor ──▶ reviewer ──▶ wrap_up
#                  │                ▲  ▲                     │
#                  │      fix ──────┘  └──── issues ─────────┘
#                  └── explain ──▶ explainer ──▶ wrap_up
# group_fix ──▶ (a proposed fix as a question, turn ends)
#
# To add a node: subclass DecisionNode / ToolNode / TextNode in nodes/, add its
# prompt as config/copilot/<name>.md, register it in build_graph, and return its
# name from the `next` of the node that should lead to it.
#

from collections.abc import AsyncIterator

from api.copilot.model import CopilotError, CopilotModel
from api.copilot.nodes import (
    CopilotNode,
    ExecutorNode,
    ExplainerNode,
    FixNode,
    GroupFixNode,
    PlannerNode,
    ResolveIntentNode,
    ReviewerNode,
    WrapUpNode,
)
from api.copilot.prompts import PromptLibrary
from api.copilot.turn import Event, Turn

MAX_NODE_RUNS = 20  # per turn: a guard against a cycle between nodes


class CopilotGraph:
    def __init__(self, nodes: list[CopilotNode], start: str) -> None:
        self.nodes = {node.name: node for node in nodes}
        self.start = start

    async def run(self, turn: Turn, start: str | None = None) -> AsyncIterator[Event]:
        """Run a turn from ``start`` (the graph's own start when None) until a node ends it."""
        name: str | None = start or self.start
        for _ in range(MAX_NODE_RUNS):
            if name is None:
                return
            node = self.nodes.get(name)
            if node is None:
                raise CopilotError(f"There's no copilot node '{name}'.")
            async for event in node.run(turn):
                yield event
            name = node.next(turn)
        raise CopilotError(f"The copilot stopped after {MAX_NODE_RUNS} steps.")


def build_graph(model: CopilotModel, prompts: PromptLibrary) -> CopilotGraph:
    nodes: list[CopilotNode] = [
        ResolveIntentNode(model, prompts),
        FixNode(model, prompts),
        GroupFixNode(model, prompts),
        PlannerNode(model, prompts),
        ExecutorNode(model, prompts),
        ReviewerNode(model, prompts),
        ExplainerNode(model, prompts),
        WrapUpNode(model, prompts),
    ]
    return CopilotGraph(nodes, start=ResolveIntentNode.name)

#
# CallLog — one call's walk through the agent's node graph, as explicit INFO log
# lines. Every line starts with the call's tag, so `grep "call 3f2a9c"` gives one
# call's whole story even when several run at once:
#
#   [call 3f2a9c] ▶ started at 'greeting' · agent 'IT Support' · can call: record_caller(full_name)
#   [call 3f2a9c]   bot  (greeting, reply 1): "Hi, who am I speaking with?"
#   [call 3f2a9c]   caller: "Ana Lee."
#   [call 3f2a9c] greeting → triage via record_caller(full_name='Ana Lee')
#   [call 3f2a9c]   in 'triage' · can call: password_issue(), other_issue() · state: {...}
#   [call 3f2a9c] ■ finished at end node 'wrap_up' after 3 steps · path: ... · state: {...}
#
# Bot replies are counted per node. The model "improvising" in a node — talking
# turn after turn without calling an action — is the usual sign it can't fill an
# action's required fields; past STUCK_AFTER replies that's logged as a WARNING
# naming what each way out needs.
#

import uuid
from typing import Any

from loguru import logger

from agent_builder.schema import AgentConfig, Edge

STUCK_AFTER = 3  # bot replies in one node without an action before warning


class CallLog:
    def __init__(self, call_id: str | None, config: AgentConfig) -> None:
        self._tag = f"[call {(call_id or uuid.uuid4().hex)[:6]}]"
        self._config = config
        self._nodes = {node.name: node for node in config.nodes}
        self._path: list[str] = []
        self._replies_in_node = 0

    def started(self) -> None:
        node = self._config.initial_node
        self._path = [node]
        self._info(f"▶ started at '{node}' · agent '{self._config.name}' · {self._options(node)}")

    def transition(self, source: str, edge: Edge, args: dict[str, Any], state: dict[str, Any]) -> None:
        """The builder's on_transition hook."""
        self._path.append(edge.target)
        self._replies_in_node = 0
        called = ", ".join(f"{key}={value!r}" for key, value in args.items())
        self._info(f"{source} → {edge.target} via {edge.function}({called})")
        self._info(f"  in '{edge.target}' · {self._options(edge.target)} · state: {state}")

    def caller_said(self, text: str) -> None:
        self._info(f'  caller: "{text}"')

    def bot_said(self, text: str, *, interrupted: bool = False) -> None:
        """A spoken reply that didn't move the call on (transitions are logged apart)."""
        if not self._path:
            return
        node = self._path[-1]
        self._replies_in_node += 1
        cut = " (interrupted)" if interrupted else ""
        self._info(f'  bot  ({node}, reply {self._replies_in_node}){cut}: "{text}"')
        if self._replies_in_node >= STUCK_AFTER and not self._nodes[node].end:
            logger.opt(depth=1).warning(
                f"{self._tag} ⚠ improvising: {self._replies_in_node} replies in '{node}' "
                f"without an action · {self._options(node)}"
            )

    def ended(self, state: dict[str, Any]) -> None:
        if not self._path:
            self._info("✕ ended before the flow started")
            return
        node = self._path[-1]
        outcome = (
            f"■ finished at end node '{node}'"
            if self._nodes[node].end
            else f"✕ caller left in '{node}' (not an end node)"
        )
        self._info(
            f"{outcome} after {len(self._path) - 1} steps · "
            f"path: {' → '.join(self._path)} · state: {state}"
        )

    def _options(self, node: str) -> str:
        edges = self._nodes[node].edges
        if self._nodes[node].end:
            return "end node, the call ends after this reply"
        # Required fields included: an action the model can't fill is a way out it can't take.
        return "can call: " + ", ".join(f"{edge.function}({', '.join(edge.required)})" for edge in edges)

    def _info(self, message: str) -> None:
        # depth=1: the log line names the event (started / transition / ended), not _info.
        logger.opt(depth=1).info(f"{self._tag} {message}")

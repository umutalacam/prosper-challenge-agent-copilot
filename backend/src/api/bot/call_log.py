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
# action's required fields; past CallRecorder.STUCK_AFTER replies that's logged as
# a WARNING naming what each way out needs.
#
# CallLog only describes: the CallRecorder it owns tracks the call (node, path,
# replies, stuck, outcome) and keeps the timeline that's stored when it ends.
#

from typing import Any

from loguru import logger

from agent_builder.schema import Edge
from api.calls.recorder import CallRecorder
from api.calls.repository import CallRecord


class CallLog:
    """The pipeline's one entry point for a call's events. Each goes to the
    CallRecorder first (which tracks the call and keeps the timeline to store),
    then becomes a log line written from what the recorder reports."""

    def __init__(self, recorder: CallRecorder) -> None:
        """:param recorder: Tracks the call and keeps its timeline; every event goes to it first."""
        self._recorder = recorder
        self._tag = f"[call {recorder.id[:6]}]"
        self._nodes = {node.name: node for node in recorder.config.nodes}

    @property
    def id(self) -> str:
        """The call's id (the recorder's)."""
        return self._recorder.id

    @property
    def outcome(self) -> str:
        """How the call ended (the recorder's view)."""
        return self._recorder.outcome

    def started(self) -> None:
        """Record and log that the flow started at the agent's start node."""
        self._recorder.started()
        node = self._recorder.node
        self._info(f"▶ started at '{node}' · agent '{self._recorder.config.name}' · {self._options(node)}")

    def transition(self, source: str, edge: Edge, args: dict[str, Any], state: dict[str, Any]) -> None:
        """Record and log a step to the next node, with what the new node allows and
        the state. The builder's on_transition hook.

        :param source: The node the call leaves.
        :param edge: The action the model called.
        :param args: What the action collected from the caller.
        :param state: The flow's state after merging ``args``.
        """
        self._recorder.transition(source, edge, args, state)
        called = ", ".join(f"{key}={value!r}" for key, value in args.items())
        self._info(f"{source} → {edge.target} via {edge.function}({called})")
        self._info(f"  in '{edge.target}' · {self._options(edge.target)} · state: {state}")

    def caller_said(self, text: str) -> None:
        """Record and log a caller turn.

        :param text: What the caller said.
        """
        self._recorder.caller_said(text)
        self._info(f'  caller: "{text}"')

    def bot_said(self, text: str, *, interrupted: bool = False) -> None:
        """Record and log a bot reply that didn't move the call on, with its count in the
        node; warn while the bot is improvising there. Ignored before the flow started.

        :param text: What the bot said.
        :param interrupted: The caller cut the reply off.
        """
        self._recorder.bot_said(text, interrupted=interrupted)
        node = self._recorder.node
        if node is None:
            return
        replies = self._recorder.replies_in_node
        cut = " (interrupted)" if interrupted else ""
        self._info(f'  bot  ({node}, reply {replies}){cut}: "{text}"')
        if self._recorder.improvising:
            logger.opt(depth=1).warning(
                f"{self._tag} ⚠ improvising: {replies} replies in '{node}' "
                f"without an action · {self._options(node)}"
            )

    def failed(self, error: BaseException) -> None:
        """Record that the pipeline failed (the call is stored with outcome ``error``) and log it.

        :param error: What the pipeline raised.
        """
        self._recorder.failed(error)
        logger.opt(depth=1).error(f"{self._tag} ✕ the call failed: {type(error).__name__}: {error}")

    def ended(self, state: dict[str, Any]) -> None:
        """Record and log how the call ended, with its path and final state.

        :param state: The flow's final state.
        """
        self._recorder.ended(state)
        outcome = self._recorder.outcome
        if outcome == "not_started":
            self._info("✕ ended before the flow started")
            return
        path = self._recorder.path
        node = path[-1]
        summary = (
            f"■ finished at end node '{node}'"
            if outcome == "completed"
            else f"✕ caller left in '{node}' (not an end node)"
        )
        self._info(f"{summary} after {len(path) - 1} steps · path: {' → '.join(path)} · state: {state}")

    def record(self) -> CallRecord:
        """The finished call, ready to store. Call after ``ended``.

        :return: The recorder's record.
        """
        return self._recorder.record()

    def _options(self, node: str) -> str:
        """What a node lets the call do next, for the log.

        :param node: The node's name.
        :return: Its actions with their required fields, or that it's an end node.
        """
        edges = self._nodes[node].edges
        if self._nodes[node].end:
            return "end node, the call ends after this reply"
        # Required fields included: an action the model can't fill is a way out it can't take.
        return "can call: " + ", ".join(f"{edge.function}({', '.join(edge.required)})" for edge in edges)

    def _info(self, message: str) -> None:
        """Write an INFO line tagged with the call.

        :param message: The line, without the tag.
        """
        # depth=1: the log line names the event (started / transition / ended), not _info.
        logger.opt(depth=1).info(f"{self._tag} {message}")

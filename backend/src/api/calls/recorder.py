#
# CallRecorder — one call's timeline, kept in memory while the call runs and
# turned into a CallRecord when it ends (CallRecordService saves it). It's the
# one place that tracks the call (node, path, replies, stuck, outcome); CallLog
# owns one, feeds it every event and writes its log lines from what it reports.
#
# Timeline events, each with `at_ms` (milliseconds since the call started):
#   {"type": "started", "node"}
#   {"type": "caller", "node", "text"}
#   {"type": "bot", "node", "text", "reply", "interrupted"}      reply: count in this node
#   {"type": "transition", "from", "to", "function", "args", "state"}   state: after the step
#   {"type": "stuck", "node", "replies"}      once per stay in a node (CallLog's ⚠ improvising)
#   {"type": "ended", "node", "outcome"}
#   {"type": "error", "message"}              last, when the pipeline raised (outcome "error")
#

import copy
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from agent_builder.schema import AgentConfig, Edge, Node
from api.agents.repository import AgentVersion
from api.calls.repository import CallRecord, Event, Outcome


class CallRecorder:
    STUCK_AFTER = 3  # bot replies in one node without an action before it counts as stuck

    @staticmethod
    def is_stuck(node: Node, replies: int) -> bool:
        """Whether the bot is improvising in a node: replying turn after turn without
        calling an action. CallLog warns on the same rule.

        :param node: The node the call is in.
        :param replies: Bot replies since the call entered it.
        :return: True from the STUCK_AFTER-th reply on, never in an end node.
        """
        return replies >= CallRecorder.STUCK_AFTER and not node.end

    @staticmethod
    def outcome_of(path: list[str], config: AgentConfig) -> Outcome:
        """How a call ended, from the nodes it walked. A pipeline error is reported apart
        (see ``failed``).

        :param path: The nodes the call visited, in order.
        :param config: The agent the call ran.
        :return: ``completed`` at an end node, ``abandoned`` anywhere else,
            ``not_started`` if the flow never started.
        """
        if not path:
            return "not_started"
        end_nodes = {node.name for node in config.nodes if node.end}
        return "completed" if path[-1] in end_nodes else "abandoned"

    def __init__(
        self,
        call_id: str | None,
        config: AgentConfig,
        version: AgentVersion | None,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Start a call's record; its clock starts now.

        :param call_id: The WebRTC session id; a random id when there's none.
        :param config: The agent the call runs.
        :param version: The saved agent version it is; None for the AGENT_FLOW file.
        :param clock: Seconds, monotonic; tests pass a fake one for exact timestamps.
        """
        self.id = call_id or uuid.uuid4().hex
        self.config = config
        self._nodes = {node.name: node for node in config.nodes}
        self._version = version
        self._clock = clock
        self._started_at = datetime.now(UTC)
        self._t0 = clock()
        self._events: list[Event] = []
        self._path: list[str] = []
        self._replies_in_node = 0
        self._stuck_here = False
        self._error: str | None = None
        self._final_state: dict[str, Any] = {}
        self._ended_ms: int | None = None

    # ---- what the call is doing now (CallLog describes it from these) -------
    @property
    def node(self) -> str | None:
        """The node the call is in now; None before it started."""
        return self._path[-1] if self._path else None

    @property
    def path(self) -> list[str]:
        """The nodes the call has visited, in order (a copy)."""
        return list(self._path)

    @property
    def replies_in_node(self) -> int:
        """Bot replies since the call entered the current node."""
        return self._replies_in_node

    @property
    def improvising(self) -> bool:
        """Whether the bot is stuck in the current node (see ``is_stuck``)."""
        node = self.node
        return node is not None and CallRecorder.is_stuck(self._nodes[node], self._replies_in_node)

    @property
    def outcome(self) -> Outcome:
        """How the call ended (``error`` if it failed), or would end if it ended now."""
        return "error" if self._error else CallRecorder.outcome_of(self._path, self.config)

    # ---- events ----------------------------------------------------------------
    def started(self) -> None:
        """Record that the flow started at the agent's start node."""
        node = self.config.initial_node
        self._path = [node]
        self._add({"type": "started", "node": node})

    def transition(self, source: str, edge: Edge, args: dict[str, Any], state: dict[str, Any]) -> None:
        """Record a step to the next node. The builder's on_transition hook.

        :param source: The node the call leaves.
        :param edge: The action the model called.
        :param args: What the action collected from the caller.
        :param state: The flow's state after merging ``args``; snapshotted, since the
            flow keeps changing it.
        """
        self._path.append(edge.target)
        self._replies_in_node = 0
        self._stuck_here = False
        self._add(
            {
                "type": "transition",
                "from": source,
                "to": edge.target,
                "function": edge.function,
                "args": copy.deepcopy(args),
                "state": copy.deepcopy(state),
            }
        )

    def caller_said(self, text: str) -> None:
        """Record a caller turn in the current node.

        :param text: What the caller said (the transcription).
        """
        self._add({"type": "caller", "node": self.node, "text": text})

    def bot_said(self, text: str, *, interrupted: bool = False) -> None:
        """Record a bot reply that didn't move the call on, and a ``stuck`` event the
        first time the bot starts improvising in this node. Ignored before the flow started.

        :param text: What the bot said.
        :param interrupted: The caller cut the reply off.
        """
        node = self.node
        if node is None:
            return
        self._replies_in_node += 1
        self._add(
            {
                "type": "bot",
                "node": node,
                "text": text,
                "reply": self._replies_in_node,
                "interrupted": interrupted,
            }
        )
        if not self._stuck_here and self.improvising:
            self._stuck_here = True
            # Stamped with the reply that tipped it: being stuck is that reply, not a later moment.
            self._add(
                {"type": "stuck", "node": node, "replies": self._replies_in_node},
                at_ms=self._events[-1]["at_ms"],
            )

    def failed(self, error: BaseException) -> None:
        """Mark the call as failed: it's stored with outcome ``error`` and an ``error`` event.

        :param error: What the pipeline raised.
        """
        self._error = f"{type(error).__name__}: {error}"

    def ended(self, state: dict[str, Any]) -> None:
        """Record the end of the call.

        :param state: The flow's final state; snapshotted.
        """
        self._final_state = copy.deepcopy(state)
        self._add({"type": "ended", "node": self.node, "outcome": self.outcome})
        self._ended_ms = self._events[-1]["at_ms"]

    def record(self) -> CallRecord:
        """The finished call, ready to store. Call after ``ended``.

        :return: The record, with the ``error`` event last if the call failed.
        """
        ended_ms = self._ended_ms if self._ended_ms is not None else self._now_ms()
        events = self._events
        if self._error:
            events = [*events, {"type": "error", "at_ms": ended_ms, "message": self._error}]
        return CallRecord(
            id=self.id,
            agent_id=self._version.agent_id if self._version else None,
            agent_version=self._version.version if self._version else None,
            agent_name=self.config.name,
            started_at=self._started_at,
            ended_at=self._started_at + timedelta(milliseconds=ended_ms),
            outcome=self.outcome,
            end_node=self.node,
            path=list(self._path),
            final_state=self._final_state,
            events=list(events),
        )

    def _now_ms(self) -> int:
        """Milliseconds since the call started."""
        return round((self._clock() - self._t0) * 1000)

    def _add(self, event: Event, *, at_ms: int | None = None) -> None:
        """Append an event to the timeline.

        :param event: The event, without its time.
        :param at_ms: Its time; now when omitted.
        """
        self._events.append({**event, "at_ms": self._now_ms() if at_ms is None else at_ms})

import asyncio

import pytest

from agent_builder import AgentBuilder
from api.agents.repository import AgentVersion
from api.bot.call_log import CallLog
from api.bot.pipeline import _save
from api.calls.recorder import CallRecorder
from tests.conftest import make_agent


class Clock:
    """Each reading is 0.25 s after the last, so timeline offsets are exact."""

    def __init__(self) -> None:
        """Start at an arbitrary monotonic time."""
        self.now = 100.0

    def __call__(self) -> float:
        """:return: A reading 0.25 s after the previous one."""
        self.now += 0.25
        return self.now


class FakeFlowManager:
    def __init__(self) -> None:
        """Start with an empty state, as a new flow does."""
        self.state: dict = {}


@pytest.fixture
def builder() -> AgentBuilder:
    """:return: The agent ``n0`` → ``n1`` → ``n2``, with ``n2`` an end node."""
    agent = make_agent("Desk", nodes=3)  # n0 -> n1 -> n2
    agent["nodes"][2]["end"] = True
    return AgentBuilder.from_dict(agent)


DESK_V4 = AgentVersion("desk", 4)


def recorder_for(builder: AgentBuilder, version: AgentVersion | None = DESK_V4) -> CallRecorder:
    """A recorder on a fake clock, hooked into the builder's transitions.

    :param builder: The agent the call runs.
    :param version: Its saved version; None for an AGENT_FLOW call.
    :return: The recorder.
    """
    recorder = CallRecorder("call-1", builder.config, version, clock=Clock())
    builder.on_transition = recorder.transition
    return recorder


def take(node: dict, args: dict, flow_manager: FakeFlowManager) -> dict:
    """Call the node's first action like the LLM would.

    :param node: The node, as the builder compiled it.
    :param args: The action's arguments.
    :param flow_manager: Holds the state the action merges into.
    :return: The next node.
    """
    _, next_node = asyncio.run(node["functions"][0].handler(args, flow_manager))
    return next_node


def test_a_call_is_recorded_as_a_timeline_with_its_state_history(builder: AgentBuilder):
    recorder = recorder_for(builder)
    flow = FakeFlowManager()

    recorder.started()
    recorder.bot_said("Hi, who's calling?")
    recorder.caller_said("Ana.")
    node = take(builder.build_initial_node(), {"name": "Ana"}, flow)
    recorder.caller_said("I need a cleaning.")
    take(node, {"reason": "cleaning"}, flow)
    recorder.bot_said("Booked. Bye!")
    recorder.ended(flow.state)
    record = recorder.record()

    assert [(e["type"], e["at_ms"]) for e in record.events] == [
        ("started", 250),
        ("bot", 500),
        ("caller", 750),
        ("transition", 1000),
        ("caller", 1250),
        ("transition", 1500),
        ("bot", 1750),
        ("ended", 2000),
    ]
    first, second = (e for e in record.events if e["type"] == "transition")
    assert first == {
        "type": "transition",
        "from": "n0",
        "to": "n1",
        "function": "to_n1",
        "args": {"name": "Ana"},
        "state": {"name": "Ana"},
        "at_ms": 1000,
    }
    # Each step keeps its own snapshot: the flow's later merges don't rewrite history.
    assert second["state"] == {"name": "Ana", "reason": "cleaning"}

    assert (record.id, record.agent_id, record.agent_version, record.agent_name) == ("call-1", "desk", 4, "Desk")
    assert (record.outcome, record.end_node, record.path) == ("completed", "n2", ["n0", "n1", "n2"])
    assert record.final_state == {"name": "Ana", "reason": "cleaning"}
    assert record.duration_ms == 2000
    assert [(t["speaker"], t["node"], t["text"]) for t in record.transcript] == [
        ("bot", "n0", "Hi, who's calling?"),
        ("caller", "n0", "Ana."),
        ("caller", "n1", "I need a cleaning."),
        ("bot", "n2", "Booked. Bye!"),
    ]


def test_outcomes(builder: AgentBuilder):
    never = recorder_for(builder)
    never.ended({})
    assert never.record().outcome == "not_started"

    left = recorder_for(builder)
    left.started()
    left.ended({})
    assert (left.record().outcome, left.record().end_node) == ("abandoned", "n0")

    broken = recorder_for(builder)
    broken.started()
    broken.failed(RuntimeError("TTS down"))
    broken.ended({})
    record = broken.record()
    assert record.outcome == "error"
    assert record.events[-1]["type"] == "error"
    assert record.events[-1]["message"] == "RuntimeError: TTS down"


def test_stuck_is_recorded_once_per_stay_in_a_node(builder: AgentBuilder):
    recorder = recorder_for(builder)
    recorder.started()
    for _ in range(5):
        recorder.bot_said("Could you repeat that?", interrupted=True)
    recorder.ended({})
    events = recorder.record().events
    assert [e for e in events if e["type"] == "stuck"] == [
        {"type": "stuck", "node": "n0", "replies": 3, "at_ms": 1000}
    ]
    assert [e["reply"] for e in events if e["type"] == "bot"] == [1, 2, 3, 4, 5]
    assert recorder.record().transcript[0]["interrupted"] is True


def test_a_file_agent_has_no_id_or_version(builder: AgentBuilder):
    recorder = recorder_for(builder, version=None)
    recorder.ended({})
    record = recorder.record()
    assert (record.agent_id, record.agent_version) == (None, None)


class Store:
    def __init__(self, fail: bool = False) -> None:
        """:param fail: Make every save raise, like a broken database."""
        self.fail = fail
        self.saved: list = []

    def save(self, record) -> None:
        """Keep the record, or raise if this store fails.

        :param record: The finished call.
        """
        if self.fail:
            raise OSError("disk full")
        self.saved.append(record)


def test_the_pipeline_saves_the_finished_call_and_never_raises(builder: AgentBuilder):
    log = CallLog(recorder_for(builder))
    log.started()
    log.ended({})
    store = Store()
    asyncio.run(_save(store, log))
    assert [r.id for r in store.saved] == ["call-1"]

    asyncio.run(_save(Store(fail=True), log))  # logged, not raised: hang-up goes on

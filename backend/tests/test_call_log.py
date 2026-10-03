import asyncio

import pytest
from loguru import logger

from agent_builder import AgentBuilder
from api.bot.call_log import CallLog

from .conftest import make_agent


@pytest.fixture
def lines():
    captured: list[str] = []
    sink = logger.add(lambda message: captured.append(message.record["message"]), level="INFO")
    yield captured
    logger.remove(sink)


@pytest.fixture
def builder() -> AgentBuilder:
    agent = make_agent("Desk", nodes=3)  # n0 -> n1 -> n2
    agent["nodes"][2]["end"] = True
    return AgentBuilder.from_dict(agent)


class FakeFlowManager:
    def __init__(self) -> None:
        self.state: dict = {}


def take(builder: AgentBuilder, node: dict, args: dict, flow_manager: FakeFlowManager) -> dict:
    """Call the node's first action like the LLM would; return the next node."""
    _, next_node = asyncio.run(node["functions"][0].handler(args, flow_manager))
    return next_node


def test_a_call_is_logged_step_by_step_and_tagged(builder: AgentBuilder, lines: list[str]):
    log = CallLog("3f2a9c11-aaaa", builder.config)
    builder.on_transition = log.transition
    flow_manager = FakeFlowManager()

    log.started()
    node = take(builder, builder.build_initial_node(), {"name": "Ana"}, flow_manager)
    take(builder, node, {}, flow_manager)
    log.ended(flow_manager.state)

    assert all(line.startswith("[call 3f2a9c] ") for line in lines)
    assert [line.removeprefix("[call 3f2a9c] ") for line in lines] == [
        "▶ started at 'n0' · agent 'Desk' · can call: to_n1()",
        "n0 → n1 via to_n1(name='Ana')",
        "  in 'n1' · can call: to_n2() · state: {'name': 'Ana'}",
        "n1 → n2 via to_n2()",
        "  in 'n2' · end node, the call ends after this reply · state: {'name': 'Ana'}",
        "■ finished at end node 'n2' after 2 steps · path: n0 → n1 → n2 · state: {'name': 'Ana'}",
    ]


def test_a_caller_leaving_mid_flow_says_where(builder: AgentBuilder, lines: list[str]):
    log = CallLog(None, builder.config)
    log.started()
    log.ended({})
    assert lines[-1].endswith("✕ caller left in 'n0' (not an end node) after 0 steps · path: n0 · state: {}")


def test_improvising_in_a_node_is_flagged_with_what_the_ways_out_need(lines: list[str]):
    agent = make_agent("Desk", nodes=2)
    agent["nodes"][0]["edges"][0]["properties"] = {"employee_id": {"type": "string"}}
    agent["nodes"][0]["edges"][0]["required"] = ["employee_id"]
    log = CallLog("abcdef00", AgentBuilder.from_dict(agent).config)
    log.started()
    log.bot_said("What's your employee ID?")
    log.caller_said("I don't know.")
    log.bot_said("Let's try another way.", interrupted=True)
    assert not any("improvising" in line for line in lines)
    log.bot_said("Can you check your badge?")

    assert lines[1:5] == [
        '[call abcdef]   bot  (n0, reply 1): "What\'s your employee ID?"',
        '[call abcdef]   caller: "I don\'t know."',
        '[call abcdef]   bot  (n0, reply 2) (interrupted): "Let\'s try another way."',
        '[call abcdef]   bot  (n0, reply 3): "Can you check your badge?"',
    ]
    assert lines[5] == (
        "[call abcdef] ⚠ improvising: 3 replies in 'n0' without an action "
        "· can call: to_n1(employee_id)"
    )


def test_moving_on_resets_the_reply_count(builder: AgentBuilder, lines: list[str]):
    log = CallLog("abcdef00", builder.config)
    log.started()
    log.bot_said("one")
    log.bot_said("two")
    log.transition("n0", builder.config.nodes[0].edges[0], {}, {})
    log.bot_said("three")
    assert lines[-1] == '[call abcdef]   bot  (n1, reply 1): "three"'

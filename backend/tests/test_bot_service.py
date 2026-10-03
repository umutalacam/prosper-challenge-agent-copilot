import json

import pytest

from api.agents.repository import AgentNotFound, AgentRepository
from api.agents.service import AgentService
from api.bot.service import BotService

from .conftest import make_agent


@pytest.fixture
def agents(repository: AgentRepository) -> AgentService:
    return AgentService(repository)


@pytest.fixture
def bot(agents: AgentService, monkeypatch) -> BotService:
    monkeypatch.delenv("AGENT_ID", raising=False)
    monkeypatch.delenv("AGENT_FLOW", raising=False)
    return BotService(agents)


def test_default_agent_comes_from_agent_id_env(agents: AgentService, monkeypatch):
    monkeypatch.setenv("AGENT_ID", "front-desk")
    assert BotService(agents).agent_id == "front-desk"


def test_without_an_agent_it_runs_the_agent_flow_file(agents: AgentService, tmp_path, monkeypatch):
    flow = tmp_path / "flow.json"
    flow.write_text(json.dumps(make_agent("From file")))
    monkeypatch.setenv("AGENT_FLOW", str(flow))  # absolute paths win over BACKEND_DIR
    assert BotService(agents).load().config.name == "From file"


def test_set_agent_switches_new_calls(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    bot.set_agent("front-desk")
    assert bot.agent_id == "front-desk"
    assert bot.load().config.name == "Front Desk"


def test_set_agent_rejects_unknown_ids_and_keeps_the_default(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    bot.set_agent("front-desk")
    with pytest.raises(AgentNotFound):
        bot.set_agent("nope")
    assert bot.agent_id == "front-desk"


def test_a_per_call_agent_beats_the_default(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    agents.create(make_agent("Billing"))
    bot.set_agent("front-desk")
    assert bot.load("billing").config.name == "Billing"


def test_each_call_reads_the_latest_saved_version(bot: BotService, agents: AgentService):
    record = agents.create(make_agent("Front Desk"))
    bot.set_agent(record.id)
    agents.update(record.id, make_agent("Front Desk", nodes=3), expected_version=record.version)
    assert len(bot.load().config.nodes) == 3


def test_start_opens_distinct_sessions(bot: BotService):
    assert bot.start({}) != bot.start({})

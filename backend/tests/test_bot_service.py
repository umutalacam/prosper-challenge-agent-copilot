import json

import pytest

from api.agents.repository import AgentNotFound, AgentRepository, AgentVersion
from api.agents.service import AgentService
from api.bot.service import BotService
from api.calls.repository import CallRepository
from api.calls.service import CallRecordService

from .conftest import make_agent


@pytest.fixture
def agents(repository: AgentRepository) -> AgentService:
    """:param repository: An empty agent database.
    :return: The agent service over it.
    """
    return AgentService(repository)


@pytest.fixture
def call_records(repository: AgentRepository, agents: AgentService) -> CallRecordService:
    """:param repository: The agent database; calls are stored in the same file.
    :param agents: The agent service.
    :return: The call record service.
    """
    return CallRecordService(CallRepository(repository.path), agents)


@pytest.fixture
def bot(agents: AgentService, call_records: CallRecordService, monkeypatch) -> BotService:
    """A bot with no default agent from the environment.

    :param agents: The agent service.
    :param call_records: The call record service.
    :param monkeypatch: Clears AGENT_ID and AGENT_FLOW.
    :return: The bot.
    """
    monkeypatch.delenv("AGENT_ID", raising=False)
    monkeypatch.delenv("AGENT_FLOW", raising=False)
    return BotService(agents, call_records)


def test_default_agent_comes_from_agent_id_env(
    agents: AgentService, call_records: CallRecordService, monkeypatch
):
    monkeypatch.setenv("AGENT_ID", "front-desk")
    assert BotService(agents, call_records).agent_id == "front-desk"


def test_without_an_agent_it_runs_the_agent_flow_file(
    agents: AgentService, call_records: CallRecordService, tmp_path, monkeypatch
):
    flow = tmp_path / "flow.json"
    flow.write_text(json.dumps(make_agent("From file")))
    monkeypatch.setenv("AGENT_FLOW", str(flow))  # absolute paths win over BACKEND_DIR
    builder, version = BotService(agents, call_records).load()
    assert builder.config.name == "From file"
    assert version is None  # a file has no saved version


def test_a_saved_agent_comes_with_its_id_and_version(bot: BotService, agents: AgentService):
    record = agents.create(make_agent("Front Desk"))
    agents.update(record.id, make_agent("Front Desk", nodes=2))
    _, version = bot.load(record.id)
    assert version == AgentVersion(record.id, 2)


def test_set_agent_switches_new_calls(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    bot.set_agent("front-desk")
    assert bot.agent_id == "front-desk"
    assert bot.load()[0].config.name == "Front Desk"


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
    assert bot.load("billing")[0].config.name == "Billing"


def test_each_call_reads_the_latest_saved_version(bot: BotService, agents: AgentService):
    record = agents.create(make_agent("Front Desk"))
    bot.set_agent(record.id)
    agents.update(record.id, make_agent("Front Desk", nodes=3), expected_version=record.version)
    assert len(bot.load()[0].config.nodes) == 3


def test_start_opens_distinct_sessions(bot: BotService):
    assert bot.start({}) != bot.start({})

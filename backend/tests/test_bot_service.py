import pytest

from api.agents.repository import AgentNotFound, AgentRepository, AgentVersion
from api.agents.service import AgentService
from api.bot.repository import DeploymentRepository
from api.bot.service import BotService, NothingDeployed
from api.calls.repository import CallRepository
from api.calls.analyzer import CallAnalyzer
from api.calls.service import CallRecordService
from tests.conftest import make_agent, make_copilot_analyzer


@pytest.fixture
def agents(repository: AgentRepository) -> AgentService:
    """The agent service.

    :param repository: An empty agent database.
    :return: The agent service over it.
    """
    return AgentService(repository)


@pytest.fixture
def call_records(repository: AgentRepository, agents: AgentService) -> CallRecordService:
    """The call record service.

    :param repository: The agent database; calls are stored in the same file.
    :param agents: The agent service.
    :return: The call record service.
    """
    return CallRecordService(CallRepository(repository.path), agents, CallAnalyzer(), make_copilot_analyzer())


@pytest.fixture
def deployments(repository: AgentRepository) -> DeploymentRepository:
    """The deployment repository.

    :param repository: The agent database; deployments are stored in the same file.
    :return: The deployment repository.
    """
    return DeploymentRepository(repository.path)


@pytest.fixture
def bot(agents: AgentService, call_records: CallRecordService, deployments: DeploymentRepository) -> BotService:
    """A bot with nothing deployed yet.

    :param agents: The agent service.
    :param call_records: The call record service.
    :param deployments: The deployment repository.
    :return: The bot.
    """
    return BotService(agents, call_records, deployments)


def test_with_nothing_deployed_a_call_is_refused(bot: BotService):
    assert bot.deployment is None
    with pytest.raises(NothingDeployed, match="Deploy one"):
        bot.load()


def test_deploying_pins_the_saved_version(bot: BotService, agents: AgentService):
    record = agents.create(make_agent("Front Desk"))
    deployment = bot.deploy(record.id)
    assert deployment.agent == AgentVersion("front-desk", 1)
    assert bot.deployment == deployment

    # Saving edits doesn't change what callers get...
    agents.update(record.id, make_agent("Front Desk", nodes=3))
    builder, version = bot.load()
    assert (len(builder.config.nodes), version) == (1, AgentVersion("front-desk", 1))

    # ...until the agent is deployed again.
    bot.deploy(record.id)
    builder, version = bot.load()
    assert (len(builder.config.nodes), version) == (3, AgentVersion("front-desk", 2))


def test_the_newest_deployment_answers_and_survives_a_restart(
    bot: BotService, agents: AgentService, call_records: CallRecordService, deployments: DeploymentRepository
):
    agents.create(make_agent("Front Desk"))
    agents.create(make_agent("Billing"))
    bot.deploy("front-desk")
    bot.deploy("billing")
    restarted = BotService(agents, call_records, DeploymentRepository(deployments.path))
    assert restarted.load()[0].config.name == "Billing"


def test_deploying_an_unknown_agent_changes_nothing(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    before = bot.deploy("front-desk")
    with pytest.raises(AgentNotFound):
        bot.deploy("nope")
    assert bot.deployment == before


def test_deleting_the_live_agent_rolls_back_to_the_one_before(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    agents.create(make_agent("Billing"))
    bot.deploy("front-desk")
    bot.deploy("billing")
    agents.delete("billing")
    assert bot.deployment is not None and bot.deployment.agent.agent_id == "front-desk"
    agents.delete("front-desk")
    assert bot.deployment is None


def test_a_call_naming_an_agent_gets_its_latest_saved_version(bot: BotService, agents: AgentService):
    agents.create(make_agent("Front Desk"))
    billing = agents.create(make_agent("Billing"))
    agents.update(billing.id, make_agent("Billing", nodes=2))
    bot.deploy("front-desk")
    builder, version = bot.load("billing")
    assert (builder.config.name, version) == ("Billing", AgentVersion("billing", 2))


def test_start_opens_distinct_sessions(bot: BotService):
    assert bot.start({}) != bot.start({})

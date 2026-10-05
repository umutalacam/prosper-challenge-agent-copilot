from pathlib import Path

import pytest

from api.agents.repository import AgentRepository
from api.agents.service import AgentService
from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallIssue, CallNotFound, CallRepository
from api.calls.service import CallRecordService
from tests.conftest import make_agent, make_call as call


@pytest.fixture
def db(tmp_path: Path) -> Path:
    """A database with the agent ``desk``.

    :param tmp_path: The test's temporary directory.
    :return: The database path.
    """
    AgentRepository(tmp_path / "calls.db").create("desk", make_agent("Desk"))
    return tmp_path / "calls.db"


@pytest.fixture
def agents(db: Path) -> AgentService:
    """:param db: The database with the agent.
    :return: The agent service on it.
    """
    return AgentService(AgentRepository(db))


@pytest.fixture
def calls(db: Path) -> CallRepository:
    """:param db: The database with the agent.
    :return: The call repository on it.
    """
    return CallRepository(db)


@pytest.fixture
def service(calls: CallRepository, agents: AgentService) -> CallRecordService:
    """:param calls: Where calls are stored.
    :param agents: The agent service.
    :return: The service under test, with the real analyzer.
    """
    return CallRecordService(calls, agents, CallAnalyzer())


def test_a_saved_call_is_stored_with_the_issues_the_analyzer_found(service: CallRecordService, calls: CallRepository):
    service.save(call("c1", stuck_in="n0"))
    assert calls.list_for_agent("desk")[0].issues == [CallIssue("stuck", "n0", 0, 900, replies=3)]


def test_a_call_whose_agent_was_deleted_meanwhile_is_skipped(
    service: CallRecordService, agents: AgentService, calls: CallRepository
):
    service.save(call("kept"))
    agents.delete("desk")
    service.save(call("late"))  # the call ended after its agent was deleted: no error, not stored
    with pytest.raises(CallNotFound):
        calls.get("late")


def test_a_full_call_carries_its_steps_and_issues(service: CallRecordService):
    service.save(call("c1", stuck_in="n0"))
    response = service.to_response(service.get("desk", "c1"))
    assert [i["kind"] for i in response["issues"]] == ["stuck"]
    assert [s["node"] for s in response["steps"]] == ["n0"]

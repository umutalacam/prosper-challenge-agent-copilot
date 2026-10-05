from pathlib import Path

import pytest

from api.agents.repository import AgentRepository
from api.agents.service import AgentService
from api.calls.repository import CallNotFound, CallRepository
from api.calls.service import CallRecordService
from tests.conftest import make_agent, make_call as call


@pytest.fixture
def db(tmp_path: Path) -> Path:
    """A database with the agents ``desk`` and ``billing``.

    :param tmp_path: The test's temporary directory.
    :return: The database path.
    """
    agents = AgentRepository(tmp_path / "calls.db")
    agents.create("desk", make_agent("Desk"))
    agents.create("billing", make_agent("Billing"))
    return tmp_path / "calls.db"


@pytest.fixture
def calls(db: Path) -> CallRepository:
    """:param db: The database with the agents.
    :return: The call repository on it.
    """
    return CallRepository(db)


def test_a_saved_call_reads_back_whole(calls: CallRepository):
    record = call("c1", stuck_in="n0")
    calls.save(record)
    assert calls.get("c1") == record


def test_an_agents_calls_list_newest_first_scoped_and_limited(calls: CallRepository):
    calls.save(call("old", minutes=0))
    calls.save(call("new", minutes=10, stuck_in="n0"))
    calls.save(call("mid", minutes=5))
    calls.save(call("other", "billing", minutes=20))

    listed = calls.list_for_agent("desk")
    assert [c.id for c in listed] == ["new", "mid", "old"]
    assert listed[0].stuck_nodes == ["n0"] and listed[1].stuck_nodes == []
    assert (listed[0].duration_ms, listed[0].agent_version, listed[0].path) == (1500, 2, ["n0"])
    assert [c.id for c in calls.list_for_agent("desk", limit=2)] == ["new", "mid"]


def test_deleting_an_agent_deletes_its_calls(db: Path, calls: CallRepository):
    calls.save(call("c1"))
    AgentRepository(db).delete("desk")
    with pytest.raises(CallNotFound):
        calls.get("c1")


def test_an_unknown_call_is_not_found(calls: CallRepository):
    with pytest.raises(CallNotFound, match="'nope'"):
        calls.get("nope")


def test_a_call_whose_agent_was_deleted_meanwhile_is_skipped(db: Path, calls: CallRepository):
    agents = AgentService(AgentRepository(db))
    service = CallRecordService(calls, agents)
    service.save(call("kept"))
    agents.delete("desk")
    service.save(call("late"))  # the call ended after its agent was deleted: no error, not stored
    with pytest.raises(CallNotFound):
        calls.get("late")

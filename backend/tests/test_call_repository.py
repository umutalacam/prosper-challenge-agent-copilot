import sqlite3
from pathlib import Path

import pytest

from api.agents.repository import AgentRepository
from api.calls.repository import CallIssue, CallNotFound, CallRepository
from tests.conftest import make_agent, make_call as call

STUCK = [CallIssue("stuck", "n0", 0, 900, replies=3)]


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
    calls.save(record, STUCK)
    assert calls.get("c1") == record


def test_an_agents_calls_list_newest_first_scoped_and_limited(calls: CallRepository):
    calls.save(call("old", minutes=0), [])
    calls.save(call("new", minutes=10, stuck_in="n0"), STUCK)
    calls.save(call("mid", minutes=5), [])
    calls.save(call("other", "billing", minutes=20), [])

    listed = calls.list_for_agent("desk")
    assert [c.id for c in listed] == ["new", "mid", "old"]
    assert listed[0].issues == STUCK and listed[1].issues == []
    assert (listed[0].duration_ms, listed[0].agent_version, listed[0].path) == (1500, 2, ["n0"])
    assert [c.id for c in calls.list_for_agent("desk", limit=2)] == ["new", "mid"]


def test_deleting_an_agent_deletes_its_calls(db: Path, calls: CallRepository):
    calls.save(call("c1"), [])
    AgentRepository(db).delete("desk")
    with pytest.raises(CallNotFound):
        calls.get("c1")


def test_an_unknown_call_is_not_found(calls: CallRepository):
    with pytest.raises(CallNotFound, match="'nope'"):
        calls.get("nope")


def test_the_list_can_be_filtered_by_outcome(calls: CallRepository):
    calls.save(call("done", outcome="completed", minutes=0), [])
    calls.save(call("left", outcome="abandoned", minutes=1), [])
    calls.save(call("broke", outcome="error", minutes=2), [])
    assert [c.id for c in calls.list_for_agent("desk", outcomes=["completed"])] == ["done"]
    assert [c.id for c in calls.list_for_agent("desk", outcomes=["error", "completed"])] == ["broke", "done"]
    assert len(calls.list_for_agent("desk", outcomes=[])) == 3  # empty means all


def test_a_calls_issues_are_stored_with_it_and_deleted_with_it(db: Path, calls: CallRepository):
    calls.save(call("c1", stuck_in="n0"), STUCK)
    calls.save(call("c2"), [])
    with sqlite3.connect(db) as conn:
        rows = conn.execute("SELECT call_id, agent_id, agent_version, kind, node, replies FROM call_issues").fetchall()
    assert rows == [("c1", "desk", 2, "stuck", "n0", 3)]

    AgentRepository(db).delete("desk")
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT count(*) FROM call_issues").fetchone() == (0,)


def test_flags_are_stored_counted_and_deleted_with_the_agent(db: Path, calls: CallRepository):
    calls.save(call("c1"), [])
    first = calls.add_flag("c1", "Booked the wrong day")
    second = calls.add_flag("c1", "Rude")
    assert [f.reason for f in calls.get("c1").flags] == ["Booked the wrong day", "Rude"]
    assert calls.get("c1").flags == [first, second]
    assert calls.list_for_agent("desk")[0].flag_count == 2

    AgentRepository(db).delete("desk")
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT count(*) FROM call_flags").fetchone() == (0,)

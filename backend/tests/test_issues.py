"""An agent's issues across its calls (the editor's Issues pane): grouped by version,
kind and node, with customers' flags, and what's new since they were last seen."""

import sqlite3
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.agents.repository import AgentNotFound, AgentRepository
from api.agents.service import AgentService
from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallAnalysis, CallIssue, CallRepository
from api.calls.service import CallRecordService
from tests.conftest import make_agent, make_call, make_copilot_analyzer


def stuck(node: str = "greeting") -> CallIssue:
    """:param node: Where.
    :return: A ``stuck`` issue there.
    """
    return CallIssue("stuck", node, 0, 900, replies=3)


def long_stay(node: str = "collect") -> CallIssue:
    """:param node: Where.
    :return: A ``long_stay`` issue there.
    """
    return CallIssue("long_stay", node, 0, 900, replies=3)


def error() -> CallIssue:
    """:return: An ``error`` issue in ``greeting``."""
    return CallIssue("error", "greeting", 0, 1500, message="RuntimeError: boom")


@pytest.fixture
def db(tmp_path: Path) -> Path:
    """:param tmp_path: The test's temporary directory.
    :return: A database with the agents ``desk`` and ``billing``.
    """
    agents = AgentRepository(tmp_path / "issues.db")
    agents.create("desk", make_agent("Desk"))
    agents.create("billing", make_agent("Billing"))
    return tmp_path / "issues.db"


@pytest.fixture
def calls(db: Path) -> CallRepository:
    """:param db: The database.
    :return: Its call repository.
    """
    return CallRepository(db)


@pytest.fixture
def service(db: Path, calls: CallRepository) -> CallRecordService:
    """:param db: The database.
    :param calls: Its call repository.
    :return: The service under test.
    """
    return CallRecordService(calls, AgentService(AgentRepository(db)), CallAnalyzer(), make_copilot_analyzer())


def save(
    calls: CallRepository,
    call_id: str,
    issues: list[CallIssue],
    *,
    version: int = 2,
    minutes: int = 0,
    agent_id: str = "desk",
) -> None:
    """Store a call on ``version`` with the given issues.

    :param calls: Where to store it.
    :param call_id: Its id.
    :param issues: Its issues, as the analyzer would have found them.
    :param version: The agent version it ran.
    :param minutes: When it started, after CALL_T0.
    :param agent_id: The agent it ran.
    """
    calls.save(replace(make_call(call_id, agent_id, minutes=minutes), agent_version=version), issues)


def test_issues_are_grouped_by_version_kind_and_node(service: CallRecordService, calls: CallRepository):
    save(calls, "a", [stuck()], version=1, minutes=0)
    save(calls, "b", [stuck(), long_stay()], version=1, minutes=5)
    save(calls, "clean", [], version=1, minutes=6)
    save(calls, "c", [long_stay(), long_stay()], version=2, minutes=10)  # twice in one call: one call
    save(calls, "d", [error()], version=2, minutes=12)
    save(calls, "other", [stuck()], agent_id="billing")  # another agent's
    calls.add_flag("clean", "It booked the wrong day")

    overview = service.issues("desk")
    v2, v1 = overview["versions"]
    assert (v2["version"], v2["call_count"], v2["calls_with_issues"]) == (2, 2, 2)
    assert (v1["version"], v1["call_count"], v1["calls_with_issues"]) == (1, 3, 3)  # the flag counts
    # Failures first, notes last.
    assert [(g["kind"], g["node"], g["call_count"]) for g in v2["groups"]] == [
        ("error", "greeting", 1),
        ("long_stay", "collect", 1),
    ]
    assert [(g["kind"], g["node"], g["call_count"]) for g in v1["groups"]] == [
        ("stuck", "greeting", 2),
        ("long_stay", "collect", 1),
    ]
    assert [c["id"] for c in v1["groups"][0]["calls"]] == ["b", "a"]  # newest first
    assert [(f["call_id"], f["reason"]) for f in v1["flags"]] == [("clean", "It booked the wrong day")]
    assert v2["flags"] == []


def test_versions_without_calls_are_left_out(service: CallRecordService, calls: CallRepository):
    save(calls, "a", [stuck()], version=3)
    assert [v["version"] for v in service.issues("desk")["versions"]] == [3]
    assert service.issues("billing") == {"seen_at": None, "new_count": 0, "versions": []}


def test_a_group_lists_at_most_twenty_calls(service: CallRecordService, calls: CallRepository):
    for i in range(25):
        save(calls, f"c{i:02}", [stuck()], minutes=i)
    (group,) = service.issues("desk")["versions"][0]["groups"]
    assert group["call_count"] == 25
    assert len(group["calls"]) == CallRepository.GROUP_CALLS
    assert group["calls"][0]["id"] == "c24"


def test_new_counts_failures_and_flags_since_last_seen_never_long_stays(
    service: CallRecordService, calls: CallRepository
):
    save(calls, "a", [stuck()], minutes=0)
    save(calls, "b", [long_stay()], minutes=1)
    save(calls, "c", [error()], minutes=2)
    calls.add_flag("b", "Rude")
    assert service.issues("desk")["new_count"] == 3  # never seen: stuck + error + the flag

    service.mark_issues_seen("desk")
    after = service.issues("desk")
    assert after["seen_at"] is not None and after["new_count"] == 0
    assert after["versions"][0]["flags"][0]["new"] is False

    # The seeded calls ended in the past; one that ends after the look is new.
    now = calls.issues_seen_at("desk")
    later = replace(make_call("d"), started_at=now + timedelta(seconds=1), ended_at=now + timedelta(seconds=2))
    calls.save(later, [stuck()])
    save(calls, "e", [long_stay()], minutes=3)  # a long stay doesn't raise the badge
    calls.add_flag("a", "Booked the wrong day")
    fresh = service.issues("desk")
    assert fresh["new_count"] == 2
    stuck_group = next(g for g in fresh["versions"][0]["groups"] if g["kind"] == "stuck")
    assert (stuck_group["call_count"], stuck_group["new_count"]) == (2, 1)


def test_seen_is_per_agent_and_goes_with_it(db: Path, service: CallRecordService, calls: CallRepository):
    save(calls, "a", [stuck()])
    save(calls, "b", [stuck()], agent_id="billing")
    service.mark_issues_seen("desk")
    assert (service.issues("desk")["new_count"], service.issues("billing")["new_count"]) == (0, 1)

    AgentRepository(db).delete("desk")
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT agent_id FROM issues_seen").fetchall() == []


def test_unknown_agents_have_no_issues(service: CallRecordService):
    with pytest.raises(AgentNotFound):
        service.issues("nope")
    with pytest.raises(AgentNotFound):
        service.mark_issues_seen("nope")


def test_the_issues_endpoints(client: TestClient, api_db: Path):
    agent_id = client.get("/api/agents").json()[0]["id"]
    CallRepository(api_db).save(make_call("c1", agent_id, stuck_in="n0"), [stuck("n0")])

    overview = client.get(f"/api/agents/{agent_id}/issues").json()
    assert overview["new_count"] == 1
    assert overview["versions"][0]["groups"][0] | {"last_at": None} == {
        "kind": "stuck",
        "node": "n0",
        "call_count": 1,
        "new_count": 1,
        "last_at": None,
        "calls": [{"id": "c1", "ended_at": "2026-10-05T09:00:01.500+00:00"}],
        "causes": [],
    }
    patched = client.patch(f"/api/agents/{agent_id}/issues", json={"seen": True})
    assert patched.status_code == 200
    assert patched.json()["seen_at"] is not None and patched.json()["new_count"] == 0
    assert client.get(f"/api/agents/{agent_id}/issues").json() == patched.json()
    assert client.patch(f"/api/agents/{agent_id}/issues", json={"seen": False}).status_code == 422
    assert client.patch(f"/api/agents/{agent_id}/issues", json={}).status_code == 422
    assert client.get("/api/agents/nope/issues").status_code == 404
    assert client.patch("/api/agents/nope/issues", json={"seen": True}).status_code == 404


def analysis(*findings: tuple[str | None, int | None, str], status: str = "done") -> CallAnalysis:
    """:param findings: ``(node, step, cause)`` each, with a suggestion that must never surface.
    :param status: The analysis status.
    :return: The analysis.
    """
    return replace(
        CallAnalysis.pending(),
        status=status,
        findings=[{"node": n, "step": s, "cause": c, "suggestion": "SUGGESTION"} for n, s, c in findings],
    )


def test_a_group_carries_its_calls_analysis_causes(service: CallRecordService, calls: CallRepository):
    save(calls, "a", [stuck(), long_stay("greeting")], minutes=0)
    save(calls, "b", [stuck()], minutes=5)
    save(calls, "c", [stuck()], minutes=6)
    calls.set_analysis("a", analysis(("greeting", 0, "Asked for the date of birth twice."), (None, None, "A flag")))
    calls.set_analysis("b", analysis(("greeting", 0, "No action for insurance questions.")))
    calls.set_analysis("c", analysis(("greeting", 0, "Not analyzed yet."), status="pending"))

    groups = {g["kind"]: g for g in service.issues("desk")["versions"][0]["groups"]}
    # Newest call first; matched by call and step (the long stay at the same step shares a's cause);
    # never the suggestions, never a pending analysis, never a flag's finding.
    assert groups["stuck"]["causes"] == ["No action for insurance questions.", "Asked for the date of birth twice."]
    assert groups["long_stay"]["causes"] == ["Asked for the date of birth twice."]

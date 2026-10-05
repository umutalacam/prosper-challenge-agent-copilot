from pathlib import Path

from fastapi.testclient import TestClient

from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallRecord, CallRepository
from tests.conftest import make_call


def seeded_agent(client: TestClient) -> str:
    """:param client: The app, seeded like a first run.
    :return: The id of the sample agent.
    """
    return client.get("/api/agents").json()[0]["id"]


def seed(api_db: Path, *records: CallRecord) -> None:
    """Store calls as the bot would: with the issues the analyzer finds in them.

    :param api_db: The app's database.
    :param records: The calls.
    """
    calls, analyzer = CallRepository(api_db), CallAnalyzer()
    for record in records:
        calls.save(record, analyzer.issues(record))


def test_lists_an_agents_calls_newest_first(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    seed(api_db, make_call("older", agent_id, minutes=0), make_call("newer", agent_id, minutes=5, stuck_in="n0"))

    response = client.get(f"/api/agents/{agent_id}/calls")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "newer",
            "agent_version": 2,
            "started_at": "2026-10-05T09:05:00+00:00",
            "duration_ms": 1500,
            "outcome": "abandoned",
            "end_node": "n0",
            "path": ["n0"],
            "issues": [
                {"kind": "stuck", "node": "n0", "step": 0, "at_ms": 900, "replies": 3, "message": None},
            ],
        },
        {
            "id": "older",
            "agent_version": 2,
            "started_at": "2026-10-05T09:00:00+00:00",
            "duration_ms": 1500,
            "outcome": "abandoned",
            "end_node": "n0",
            "path": ["n0"],
            "issues": [],
        },
    ]
    assert len(client.get(f"/api/agents/{agent_id}/calls", params={"limit": 1}).json()) == 1
    assert client.get(f"/api/agents/{agent_id}/calls", params={"limit": 0}).status_code == 422


def test_gets_one_call_with_its_transcript_and_timeline(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    seed(api_db, make_call("c1", agent_id, stuck_in="n0"))

    call = client.get(f"/api/agents/{agent_id}/calls/c1").json()
    assert (call["agent_id"], call["agent_name"], call["outcome"]) == (agent_id, "Desk", "abandoned")
    assert call["transcript"] == [{"speaker": "bot", "node": "n0", "text": "Hi", "at_ms": 400}]
    assert [e["type"] for e in call["events"]] == ["started", "bot", "stuck", "ended"]
    assert call["final_state"] == {"name": "Ana"}
    assert [i["kind"] for i in call["issues"]] == ["stuck"]
    assert call["steps"] == [
        {"node": "n0", "entered_ms": 0, "stay_ms": 1500, "replies": 1, "exit": None, "ending": "abandoned"},
    ]


def test_unknown_agents_and_calls_are_404(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    assert client.get("/api/agents/nope/calls").status_code == 404
    assert client.get(f"/api/agents/{agent_id}/calls/nope").status_code == 404

    # A call is only reachable under its own agent.
    other = client.post("/api/agents", json={"name": "Other", "initial_node": "a", "nodes": [{"name": "a", "end": True}]})
    seed(api_db, make_call("theirs", other.json()["id"]))
    assert client.get(f"/api/agents/{agent_id}/calls/theirs").status_code == 404
    assert client.get(f"/api/agents/{other.json()['id']}/calls/theirs").status_code == 200


def test_the_list_filters_by_outcome(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    seed(
        api_db,
        make_call("done", agent_id, outcome="completed"),
        make_call("left", agent_id, outcome="abandoned", minutes=1),
        make_call("broke", agent_id, outcome="error", minutes=2),
    )

    def ids(**params) -> list[str]:
        return [c["id"] for c in client.get(f"/api/agents/{agent_id}/calls", params=params).json()]

    assert ids(outcome="completed") == ["done"]
    assert ids(outcome=["completed", "error"]) == ["broke", "done"]
    assert ids() == ["broke", "left", "done"]
    assert client.get(f"/api/agents/{agent_id}/calls", params={"outcome": "lost"}).status_code == 422

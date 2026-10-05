from pathlib import Path

from fastapi.testclient import TestClient

from api.calls.repository import CallRepository
from tests.conftest import make_call


def seeded_agent(client: TestClient) -> str:
    """:param client: The app, seeded like a first run.
    :return: The id of the sample agent.
    """
    return client.get("/api/agents").json()[0]["id"]


def test_lists_an_agents_calls_newest_first(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    calls = CallRepository(api_db)
    calls.save(make_call("older", agent_id, minutes=0))
    calls.save(make_call("newer", agent_id, minutes=5, stuck_in="n0"))

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
            "stuck_nodes": ["n0"],
        },
        {
            "id": "older",
            "agent_version": 2,
            "started_at": "2026-10-05T09:00:00+00:00",
            "duration_ms": 1500,
            "outcome": "abandoned",
            "end_node": "n0",
            "path": ["n0"],
            "stuck_nodes": [],
        },
    ]
    assert len(client.get(f"/api/agents/{agent_id}/calls", params={"limit": 1}).json()) == 1
    assert client.get(f"/api/agents/{agent_id}/calls", params={"limit": 0}).status_code == 422


def test_gets_one_call_with_its_transcript_and_timeline(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    CallRepository(api_db).save(make_call("c1", agent_id, stuck_in="n0"))

    call = client.get(f"/api/agents/{agent_id}/calls/c1").json()
    assert (call["agent_id"], call["agent_name"], call["outcome"]) == (agent_id, "Desk", "abandoned")
    assert call["transcript"] == [{"speaker": "bot", "node": "n0", "text": "Hi", "at_ms": 400}]
    assert [e["type"] for e in call["events"]] == ["started", "bot", "stuck", "ended"]
    assert call["final_state"] == {"name": "Ana"}


def test_unknown_agents_and_calls_are_404(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    assert client.get("/api/agents/nope/calls").status_code == 404
    assert client.get(f"/api/agents/{agent_id}/calls/nope").status_code == 404

    # A call is only reachable under its own agent.
    other = client.post("/api/agents", json={"name": "Other", "initial_node": "a", "nodes": [{"name": "a", "end": True}]})
    CallRepository(api_db).save(make_call("theirs", other.json()["id"]))
    assert client.get(f"/api/agents/{agent_id}/calls/theirs").status_code == 404
    assert client.get(f"/api/agents/{other.json()['id']}/calls/theirs").status_code == 200


def test_the_list_filters_by_outcome(client: TestClient, api_db: Path):
    agent_id = seeded_agent(client)
    calls = CallRepository(api_db)
    calls.save(make_call("done", agent_id, outcome="completed"))
    calls.save(make_call("left", agent_id, outcome="abandoned", minutes=1))
    calls.save(make_call("broke", agent_id, outcome="error", minutes=2))

    def ids(**params) -> list[str]:
        return [c["id"] for c in client.get(f"/api/agents/{agent_id}/calls", params=params).json()]

    assert ids(outcome="completed") == ["done"]
    assert ids(outcome=["completed", "error"]) == ["broke", "done"]
    assert ids() == ["broke", "left", "done"]
    assert client.get(f"/api/agents/{agent_id}/calls", params={"outcome": "lost"}).status_code == 422

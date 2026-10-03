from fastapi.testclient import TestClient

from api import create_app, get_repository
from storage import AgentRepository

from .conftest import make_agent


def test_seeds_example_agent_into_an_empty_database(client: TestClient):
    agents = client.get("/api/agents").json()
    assert [(a["id"], a["name"], a["node_count"], a["version"]) for a in agents] == [
        ("prosper-scheduler", "Prosper Scheduler", 4, 1)
    ]


def test_get_returns_body_version_and_etag(client: TestClient):
    res = client.get("/api/agents/prosper-scheduler")
    assert res.status_code == 200
    assert res.headers["etag"] == '"1"'
    body = res.json()
    assert body["id"] == "prosper-scheduler" and body["version"] == 1
    assert body["initial_node"] == "greeting"


def test_create_slugs_the_name_and_strips_response_keys(client: TestClient):
    payload = {**make_agent("My New Agent"), "id": "ignored", "version": 99}
    res = client.post("/api/agents", json=payload)
    assert res.status_code == 201
    assert res.json()["id"] == "my-new-agent"
    assert res.json()["version"] == 1
    stored = client.get("/api/agents/my-new-agent").json()
    assert "ignored" not in str(stored) and stored["version"] == 1


def test_update_with_matching_if_match_bumps_version(client: TestClient):
    res = client.put(
        "/api/agents/prosper-scheduler",
        json=make_agent("Renamed"),
        headers={"If-Match": '"1"'},
    )
    assert res.status_code == 200
    assert res.json()["version"] == 2 and res.headers["etag"] == '"2"'


def test_update_with_stale_if_match_is_409(client: TestClient):
    client.put("/api/agents/prosper-scheduler", json=make_agent("A"), headers={"If-Match": "1"})
    res = client.put(
        "/api/agents/prosper-scheduler", json=make_agent("B"), headers={"If-Match": "1"}
    )
    assert res.status_code == 409
    assert res.json()["current_version"] == 2
    assert client.get("/api/agents/prosper-scheduler").json()["name"] == "A"


def test_invalid_agents_are_rejected_with_the_builder_message(client: TestClient):
    bad = make_agent(nodes=1)
    bad["nodes"][0]["edges"] = [{"function": "f", "description": "", "target": "ghost"}]
    res = client.post("/api/agents", json=bad)
    assert res.status_code == 422
    assert "unknown node 'ghost'" in res.json()["detail"]

    res = client.post("/api/agents", json={"name": "x", "nodes": []})
    assert res.status_code == 422
    assert "initial_node" in res.json()["detail"]


def test_bad_if_match_is_400(client: TestClient):
    res = client.put(
        "/api/agents/prosper-scheduler", json=make_agent(), headers={"If-Match": "abc"}
    )
    assert res.status_code == 400


def test_unknown_and_malformed_ids_are_404(client: TestClient):
    assert client.get("/api/agents/nope").status_code == 404
    assert client.get("/api/agents/Bad_ID").status_code == 404
    assert client.put("/api/agents/nope", json=make_agent()).status_code == 404
    assert client.delete("/api/agents/nope").status_code == 404


def test_delete_respects_if_match(client: TestClient):
    client.put("/api/agents/prosper-scheduler", json=make_agent())
    assert (
        client.delete("/api/agents/prosper-scheduler", headers={"If-Match": "1"}).status_code
        == 409
    )
    assert (
        client.delete("/api/agents/prosper-scheduler", headers={"If-Match": "2"}).status_code
        == 204
    )
    assert client.get("/api/agents").json() == []


def test_repository_bean_can_be_overridden(tmp_path):
    """Routes depend on get_repository, so a test (or another store) can replace it."""
    other = AgentRepository(tmp_path / "other.db")
    other.create("override", make_agent("From override"))
    app = create_app(lambda: AgentRepository(tmp_path / "default.db"))
    app.dependency_overrides[get_repository] = lambda: other
    with TestClient(app) as client:
        assert [a["id"] for a in client.get("/api/agents").json()] == ["override"]


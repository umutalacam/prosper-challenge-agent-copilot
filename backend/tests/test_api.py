import json
from fastapi.testclient import TestClient

from api.agents.repository import AgentRepository
from dependencies import get_agent_repository, get_agent_service
from main import create_app

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


def test_providers_are_singletons_and_overridable(tmp_path, monkeypatch):
    """One shared repository/service per process; tests swap the repository."""
    monkeypatch.setenv("AGENTS_DB", str(tmp_path / "singleton.db"))  # never the real file
    get_agent_repository.cache_clear()
    try:
        repository = get_agent_repository()
        assert repository is get_agent_repository()
        assert repository.path == tmp_path / "singleton.db"
        assert get_agent_service(repository) is get_agent_service(repository)
    finally:
        get_agent_repository.cache_clear()

    other = AgentRepository(tmp_path / "other.db")
    other.create("override", make_agent("From override"))
    app = create_app()
    app.dependency_overrides[get_agent_repository] = lambda: other
    with TestClient(app) as client:
        assert [a["id"] for a in client.get("/api/agents").json()] == ["override"]


def test_bot_deploys_an_agents_saved_version(client: TestClient):
    status = client.get("/api/bot").json()
    assert (status["agent_id"], status["version"], status["deployed_at"]) == (None, None, None)

    response = client.put("/api/bot", json={"agent_id": "prosper-scheduler"})
    assert response.status_code == 200
    deployed = response.json()
    assert (deployed["agent_id"], deployed["version"]) == ("prosper-scheduler", 1)
    assert deployed["deployed_at"] and deployed["client_url"].endswith("/client/")
    assert client.get("/api/bot").json() == deployed  # stored, not just in memory


def test_with_nothing_deployed_a_call_is_refused(client: TestClient):
    response = client.post("/api/offer", json={"sdp": "v=0", "type": "offer"})
    assert response.status_code == 409
    assert "Deploy one" in response.json()["detail"]


def test_bot_refuses_unknown_agents(client: TestClient):
    before = client.get("/api/bot").json()["agent_id"]
    assert client.put("/api/bot", json={"agent_id": "nope"}).status_code == 404
    assert client.get("/api/bot").json()["agent_id"] == before


def test_voice_client_and_signaling_are_served(client: TestClient):
    assert client.get("/client/").status_code == 200
    assert client.get("/", follow_redirects=False).headers["location"] == "/client/"
    assert "sessionId" in client.post("/start", json={}).json()
    assert client.post("/api/offer", json={}).status_code == 400


def test_copilot_streams_ndjson_events(client: TestClient):
    from dependencies import get_copilot_service

    class FakeCopilot:
        async def run_turn(self, agent, messages, fix=None, group_fix=None):
            what = f"fix in {fix['node']}" if fix else messages[-1]["content"]
            yield {"type": "reply", "text": f"Got {what} for {agent['name']}"}
            yield {"type": "done"}

    client.app.dependency_overrides[get_copilot_service] = lambda: FakeCopilot()
    body = {"agent": {"name": "A"}, "messages": [{"role": "user", "content": "hi"}]}
    response = client.post("/api/copilot/turns", json=body)
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert [json.loads(line) for line in response.text.splitlines()] == [
        {"type": "reply", "text": "Got hi for A"},
        {"type": "done"},
    ]
    fix = {"call_id": "c1", "node": "greeting", "step": 0, "cause": "c", "suggestion": "s"}
    response = client.post("/api/copilot/turns", json=body | {"fix": fix})
    assert json.loads(response.text.splitlines()[0]) == {"type": "reply", "text": "Got fix in greeting for A"}
    assert client.post("/api/copilot/turns", json=body | {"fix": {"node": "greeting"}}).status_code == 422
    group = {"kind": "stuck", "node": "greeting", "version": 1, "call_count": 2, "causes": ["c"]}
    assert client.post("/api/copilot/turns", json=body | {"group_fix": group}).status_code == 200
    assert client.post("/api/copilot/turns", json=body | {"group_fix": group | {"causes": []}}).status_code == 422
    assert client.post("/api/copilot/turns", json=body | {"fix": fix, "group_fix": group}).status_code == 422
    body["messages"] = [{"role": "assistant", "content": "hello"}]
    assert client.post("/api/copilot/turns", json=body).status_code == 422

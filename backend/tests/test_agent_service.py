import pytest

from api.agents.repository import AgentNotFound, AgentRepository, VersionConflict
from api.agents.service import AgentService, InvalidAgent

from .conftest import make_agent


@pytest.fixture
def service(repository: AgentRepository) -> AgentService:
    return AgentService(repository)


def test_create_derives_a_unique_id_from_the_name(service: AgentService):
    assert service.create(make_agent("Front Desk")).id == "front-desk"
    assert service.create(make_agent("Front Desk")).id == "front-desk-2"
    assert service.create(make_agent("!!!")).id == "agent"


def test_create_rejects_what_the_bot_could_not_load(service: AgentService):
    broken = make_agent()
    broken["initial_node"] = "missing"
    with pytest.raises(InvalidAgent, match="initial_node 'missing'"):
        service.create(broken)
    with pytest.raises(InvalidAgent, match="Missing required field 'name'"):
        service.create({"initial_node": "a", "nodes": []})
    assert service.list() == []


def test_nothing_may_lead_into_the_start_node(service: AgentService):
    looping = make_agent(nodes=2)
    looping["nodes"][1]["edges"] = [{"function": "restart", "description": "", "target": "n0"}]
    with pytest.raises(InvalidAgent, match="targets the start node 'n0'"):
        service.create(looping)


def test_an_action_must_move_to_another_node(service: AgentService):
    looping = make_agent(nodes=2)
    looping["nodes"][1]["edges"] = [{"function": "again", "description": "", "target": "n1"}]
    with pytest.raises(InvalidAgent, match="leads back to 'n1'"):
        service.create(looping)


def test_an_end_node_has_no_actions(service: AgentService):
    ending = make_agent(nodes=2)
    ending["nodes"][0]["end"] = True  # n0 -> n1 is its action
    with pytest.raises(InvalidAgent, match="End node 'n0' can't have actions"):
        service.create(ending)


def test_update_validates_and_checks_the_version(service: AgentService):
    created = service.create(make_agent("A"))
    assert service.update(created.id, make_agent("B"), expected_version=1).version == 2
    with pytest.raises(VersionConflict):
        service.update(created.id, make_agent("C"), expected_version=1)
    with pytest.raises(InvalidAgent):
        service.update(created.id, {"name": "x"})


@pytest.mark.parametrize("bad_id", ["Bad_ID", "../etc", "a b", ""])
def test_malformed_ids_are_not_found(service: AgentService, bad_id: str):
    with pytest.raises(AgentNotFound):
        service.get(bad_id)
    with pytest.raises(AgentNotFound):
        service.delete(bad_id)


def test_delete_with_version(service: AgentService):
    created = service.create(make_agent())
    service.delete(created.id, expected_version=1)
    assert service.list() == []

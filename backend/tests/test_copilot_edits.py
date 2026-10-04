import pytest

from agent_builder import AgentBuilder
from api.copilot.edits import AgentEdits, EditError


def draft() -> dict:
    return {
        "name": "New agent",
        "persona": "",
        "initial_node": "greeting",
        "nodes": [{"name": "greeting", "task_messages": [], "edges": [], "position": {"x": 0, "y": 0}}],
    }


def test_builds_a_valid_agent_step_by_step():
    edits = AgentEdits(draft())
    assert edits.set_agent_settings(name="Help Desk", persona="Be kind.") == (
        "Updated the agent's name and persona"
    )
    assert edits.update_node("greeting", task="Greet the caller.") == "Updated node 'greeting': rewrote its task"
    assert edits.add_node("wrap_up", "Say goodbye.", end=True) == "Added end node 'wrap_up'"
    assert edits.add_action(
        "greeting",
        "wrap_up",
        "record_name",
        "The caller said their name.",
        [{"name": "full_name", "type": "string", "description": "Name"},
         {"name": "employee_id", "type": "string", "description": "ID", "required": False}],
    ) == "Added action 'record_name': greeting → wrap_up, collecting full_name and employee_id"
    AgentBuilder.from_dict(edits.agent)  # valid
    edge = edits.agent["nodes"][0]["edges"][0]
    assert edge["required"] == ["full_name"]
    assert edits.agent["nodes"][0]["position"] == {"x": 0, "y": 0}  # layout untouched


def test_does_not_change_the_input():
    agent = draft()
    AgentEdits(agent).add_node("extra", "Task.")
    assert len(agent["nodes"]) == 1


@pytest.mark.parametrize(
    "apply, error",
    [
        (lambda e: e.add_node("greeting", "x"), "already exists"),
        (lambda e: e.add_node("Bad Name", "x"), "snake_case"),
        (lambda e: e.add_action("greeting", "greeting", "loop", ""), "another node"),
        (lambda e: e.add_action("other", "greeting", "back", ""), "start node"),
        (lambda e: e.add_action("done", "other", "more", ""), "end node"),
        (lambda e: e.add_action("greeting", "nope", "go", ""), "no node named 'nope'"),
        (lambda e: e.delete_node("greeting"), "start node"),
        (lambda e: e.update_node("other", end=True), "still has actions"),
        (lambda e: e.delete_action("greeting", "nope"), "no action named 'nope'"),
        (lambda e: e.add_action("greeting", "other", "x", "", [{"name": "a", "type": "date"}]), "type 'date'"),
        (lambda e: e.set_agent_settings(), "Nothing to change"),
    ],
)
def test_refuses_what_the_graph_rules_forbid(apply, error):
    edits = AgentEdits(draft())
    edits.add_node("other", "Task.")
    edits.add_node("done", "Bye.", end=True)
    edits.add_action("other", "done", "finish", "Done.")
    with pytest.raises(EditError, match=error):
        apply(edits)


def test_rename_and_delete_cascade_to_actions():
    edits = AgentEdits(draft())
    edits.add_node("collect", "Ask.")
    edits.add_action("greeting", "collect", "go", "Next.")
    edits.update_node("collect", new_name="collect_details")
    assert edits.agent["nodes"][0]["edges"][0]["target"] == "collect_details"
    edits.update_node("greeting", new_name="hello")
    assert edits.agent["initial_node"] == "hello"
    assert edits.delete_node("collect_details") == "Deleted node 'collect_details' and 1 action leading to it"
    assert edits.agent["nodes"][0]["edges"] == []

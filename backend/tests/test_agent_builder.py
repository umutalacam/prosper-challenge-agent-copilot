from agent_builder import AgentBuilder
from agent_builder.builder import VOICE_RULES


def agent(persona: str = "You are the front desk of Bright Smile Dental.", **node: object) -> dict:
    """:param persona: The agent's persona.
    :param node: Extra fields for its one node.
    :return: A one-node agent.
    """
    return {
        "name": "Desk",
        "persona": persona,
        "initial_node": "greeting",
        "nodes": [{"name": "greeting", "task_messages": [], "edges": [], "end": True, **node}],
    }


def test_every_call_gets_the_voice_rules_after_the_persona():
    role = AgentBuilder.from_dict(agent()).build_initial_node()["role_message"]
    assert role == f"You are the front desk of Bright Smile Dental.\n\n{VOICE_RULES}"
    assert "Never use lists" in VOICE_RULES and "emojis" in VOICE_RULES


def test_a_node_override_and_an_empty_persona_still_get_them():
    override = AgentBuilder.from_dict(agent(role_message="Be brief.")).build_initial_node()["role_message"]
    assert override == f"Be brief.\n\n{VOICE_RULES}"
    assert AgentBuilder.from_dict(agent(persona="")).build_initial_node()["role_message"] == VOICE_RULES

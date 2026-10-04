"""The copilot's config folder (backend/config/copilot/) agrees with the code."""

import inspect

from api.copilot.graph import build_graph
from api.copilot.model import CopilotModel
from api.copilot.nodes import EDIT_TOOLS, DecisionNode
from api.copilot.prompts import PromptLibrary
from config import COPILOT_DIR

from tests.copilot_fakes import ScriptedModel

PROMPTS = PromptLibrary(COPILOT_DIR)
GRAPH = build_graph(CopilotModel(ScriptedModel(), "test-model"), PROMPTS)


def test_every_node_has_a_prompt_and_every_deciding_node_a_schema():
    assert (COPILOT_DIR / "shared.md").is_file()
    for name, node in GRAPH.nodes.items():
        assert (COPILOT_DIR / f"{name}.md").is_file(), name
        if isinstance(node, DecisionNode):
            assert PROMPTS.schema(name), name


def test_every_tool_matches_its_edit():
    """tools.json and AgentEdits agree: same tools, same arguments, same required ones."""
    tools = {tool["function"]["name"]: tool["function"]["parameters"] for tool in PROMPTS.tools()}
    assert set(tools) == set(EDIT_TOOLS)
    for name, operation in EDIT_TOOLS.items():
        params = list(inspect.signature(operation).parameters.values())[1:]  # without self
        assert set(tools[name]["properties"]) == {param.name for param in params}, name
        assert set(tools[name]["required"]) == {
            param.name for param in params if param.default is inspect.Parameter.empty
        }, name


def _strict_problems(schema: dict, path: str) -> list[str]:
    """What OpenAI's strict mode would reject: objects must list every property as required."""
    problems = []
    if schema.get("type") == "object":
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is not False:
            problems.append(f"{path}: additionalProperties must be false")
        if set(schema.get("required", [])) != set(properties):
            problems.append(f"{path}: every property must be required")
        for key, child in properties.items():
            problems += _strict_problems(child, f"{path}.{key}")
    if schema.get("type") == "array":
        problems += _strict_problems(schema.get("items", {}), f"{path}[]")
    return problems


def test_every_schema_is_valid_for_strict_mode():
    for name, node in GRAPH.nodes.items():
        if isinstance(node, DecisionNode):
            assert _strict_problems(PROMPTS.schema(name), name) == []

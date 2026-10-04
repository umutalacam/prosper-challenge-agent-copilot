#
# Code checks on the agent, no model involved: is it valid (the same check as
# saving), and does it work end to end.
#

from typing import Any

from agent_builder import AgentBuilder


def validation_error(agent: dict[str, Any]) -> str | None:
    """AgentBuilder's verdict (the same check as saving), or None if valid."""
    try:
        AgentBuilder.from_dict(agent)
    except KeyError as error:
        return f"Missing required field {error}."
    except (ValueError, TypeError) as error:
        return str(error)
    return None


def completeness_gaps(agent: dict[str, Any]) -> list[str]:
    """What keeps a structurally valid flow from working end to end."""
    nodes = {node["name"]: node for node in agent.get("nodes", [])}
    gaps = [
        f"'{name}' has no actions and isn't an end node, so calls get stuck there."
        for name, node in nodes.items()
        if not node.get("end") and not node.get("edges")
    ]
    if not any(node.get("end") for node in nodes.values()):
        gaps.append("There's no end node, so no call can finish.")
    reached, todo = set(), [agent.get("initial_node")]
    while todo:
        name = todo.pop()
        if name in nodes and name not in reached:
            reached.add(name)
            todo.extend(edge["target"] for edge in nodes[name].get("edges", []))
    gaps += [f"Nothing leads to '{name}', so no call reaches it." for name in nodes if name not in reached]
    return gaps

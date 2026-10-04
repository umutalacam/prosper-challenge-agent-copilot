#
# ExecutorNode — carries out the plan with the edit tools (config/copilot/tools.json),
# each applied by AgentEdits. Refused edits go back to the model as tool errors.
#

from collections.abc import Callable
from typing import Any

from api.copilot.edits import AgentEdits, EditError
from api.copilot.nodes.base import ToolNode, numbered
from api.copilot.turn import Event, Turn

# Every tool in tools.json and the AgentEdits method that applies it.
EDIT_TOOLS: dict[str, Callable[..., str]] = {
    "set_agent_settings": AgentEdits.set_agent_settings,
    "add_node": AgentEdits.add_node,
    "update_node": AgentEdits.update_node,
    "delete_node": AgentEdits.delete_node,
    "add_action": AgentEdits.add_action,
    "update_action": AgentEdits.update_action,
    "delete_action": AgentEdits.delete_action,
}


class ExecutorNode(ToolNode):
    name = "executor"
    activity = "Building…"

    def tools(self) -> list[dict[str, Any]]:
        return self.prompts.tools()

    def context(self, turn: Turn) -> str | None:
        if not turn.plan:
            return "There's no written plan; make the change the user asked for."
        return "Carry out this plan:\n" + numbered(turn.plan)

    def apply(self, turn: Turn, name: str, args: dict[str, Any]) -> tuple[dict[str, Any], list[Event]]:
        result = _apply(turn.edits, name, args)
        text = result.get("result") or result["error"]
        events: list[Event] = [{"type": "step", "text": text, "ok": result["ok"]}]
        if result["ok"]:
            turn.steps.append(text)
            events.append({"type": "agent", "agent": turn.agent})
        return result, events

    def next(self, turn: Turn) -> str | None:
        return "reviewer"


def _apply(edits: AgentEdits, name: str, args: dict[str, Any]) -> dict[str, Any]:
    operation = EDIT_TOOLS.get(name)
    if operation is None:
        return {"ok": False, "error": f"Unknown tool '{name}'."}
    try:
        return {"ok": True, "result": operation(edits, **args)}
    except EditError as error:
        return {"ok": False, "error": f"{name} refused: {error}"}
    except TypeError as error:  # unexpected or missing arguments
        return {"ok": False, "error": f"{name} got bad arguments: {error}"}

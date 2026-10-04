#
# AgentEdits — the operations the copilot can apply to an agent document (the
# agent JSON, as the editor holds it). Each returns a short past-tense summary
# the UI shows as "what the copilot just did", or raises EditError with a reason
# the model can act on.
#
# The graph rules match the editor's reducer and AgentBuilder's validation:
# unique names, nothing leads into the start node, an action moves to another
# node, end nodes lead nowhere; renames and deletions cascade to action targets.
#

import copy
import re
from typing import Any

NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
FIELD_TYPES = ("string", "number", "boolean")


class EditError(ValueError):
    """The edit was refused; the message says why, for the model to fix."""


class AgentEdits:
    def __init__(self, agent: dict[str, Any]) -> None:
        self.agent = copy.deepcopy(agent)
        self.agent.setdefault("nodes", [])
        for node in self.agent["nodes"]:
            node.setdefault("edges", [])
            node.setdefault("task_messages", [])

    # ---- agent ---------------------------------------------------------------
    def set_agent_settings(
        self,
        name: str | None = None,
        persona: str | None = None,
        model: str | None = None,
        voice_id: str | None = None,
    ) -> str:
        changes = {
            key: value
            for key, value in {"name": name, "persona": persona, "model": model, "voice_id": voice_id}.items()
            if value is not None
        }
        if not changes:
            raise EditError("Nothing to change: pass at least one setting.")
        if "name" in changes and not changes["name"].strip():
            raise EditError("The agent's name can't be empty.")
        self.agent.update(changes)
        return f"Updated the agent's {_join(list(changes))}"

    # ---- nodes ---------------------------------------------------------------
    def add_node(
        self, name: str, task: str, end: bool = False, role_message: str | None = None
    ) -> str:
        self._check_new_name(name)
        node: dict[str, Any] = {
            "name": name,
            "task_messages": [{"role": "developer", "content": task}],
            "edges": [],
        }
        if role_message:
            node["role_message"] = role_message
        if end:
            node["end"] = True
        self.agent["nodes"].append(node)
        if not self.agent.get("initial_node"):
            self.agent["initial_node"] = name
        return f"Added {'end ' if end else ''}node '{name}'"

    def update_node(
        self,
        name: str,
        new_name: str | None = None,
        task: str | None = None,
        role_message: str | None = None,
        end: bool | None = None,
    ) -> str:
        node = self._node(name)
        done: list[str] = []
        if end is not None and end != bool(node.get("end")):
            if end and node["edges"]:
                raise EditError(
                    f"'{name}' still has actions ({_functions(node)}); an end node leads "
                    "nowhere, so delete them first."
                )
            node["end"] = end
            done.append("made it an end node" if end else "made it a regular node")
        if task is not None:
            node["task_messages"] = [{"role": "developer", "content": task}]
            done.append("rewrote its task")
        if role_message is not None:
            if role_message:
                node["role_message"] = role_message
            else:
                node.pop("role_message", None)
            done.append("changed its personality override")
        if new_name is not None and new_name != name:
            self._check_new_name(new_name)
            self._rename(name, new_name)
            done.append(f"renamed it to '{new_name}'")
        if not done:
            raise EditError("Nothing to change: pass at least one field.")
        return f"Updated node '{name}': {_join(done)}"

    def delete_node(self, name: str) -> str:
        node = self._node(name)
        if name == self.agent.get("initial_node"):
            raise EditError(f"'{name}' is the start node and can't be deleted.")
        self.agent["nodes"].remove(node)
        removed = 0
        for other in self.agent["nodes"]:
            before = len(other["edges"])
            other["edges"] = [edge for edge in other["edges"] if edge["target"] != name]
            removed += before - len(other["edges"])
        suffix = f" and {removed} action{'s' if removed != 1 else ''} leading to it" if removed else ""
        return f"Deleted node '{name}'{suffix}"

    # ---- actions -------------------------------------------------------------
    def add_action(
        self,
        source: str,
        target: str,
        function: str,
        description: str,
        fields: list[dict[str, Any]] | None = None,
    ) -> str:
        node = self._node(source)
        self._check_target(node, target)
        if not NAME_PATTERN.fullmatch(function):
            raise EditError(f"Action name '{function}' must be snake_case (a-z, 0-9, _).")
        if any(edge["function"] == function for edge in node["edges"]):
            raise EditError(f"'{source}' already has an action named '{function}'.")
        properties, required = _fields(fields or [])
        node["edges"].append(
            {
                "function": function,
                "description": description,
                "target": target,
                "properties": properties,
                "required": required,
            }
        )
        collects = f", collecting {_join(list(properties))}" if properties else ""
        return f"Added action '{function}': {source} → {target}{collects}"

    def update_action(
        self,
        source: str,
        function: str,
        new_function: str | None = None,
        description: str | None = None,
        target: str | None = None,
        fields: list[dict[str, Any]] | None = None,
    ) -> str:
        node = self._node(source)
        edge = self._edge(node, function)
        done: list[str] = []
        if target is not None and target != edge["target"]:
            self._check_target(node, target)
            edge["target"] = target
            done.append(f"now goes to '{target}'")
        if description is not None:
            edge["description"] = description
            done.append("new description")
        if fields is not None:
            edge["properties"], edge["required"] = _fields(fields)
            done.append(f"collects {_join(list(edge['properties'])) or 'nothing'}")
        if new_function is not None and new_function != function:
            if not NAME_PATTERN.fullmatch(new_function):
                raise EditError(f"Action name '{new_function}' must be snake_case (a-z, 0-9, _).")
            if any(other["function"] == new_function for other in node["edges"]):
                raise EditError(f"'{source}' already has an action named '{new_function}'.")
            edge["function"] = new_function
            done.append(f"renamed to '{new_function}'")
        if not done:
            raise EditError("Nothing to change: pass at least one field.")
        return f"Updated action '{function}' in '{source}': {_join(done)}"

    def delete_action(self, source: str, function: str) -> str:
        node = self._node(source)
        node["edges"].remove(self._edge(node, function))
        return f"Deleted action '{function}' from '{source}'"

    # ---- helpers -------------------------------------------------------------
    def _node(self, name: str) -> dict[str, Any]:
        for node in self.agent["nodes"]:
            if node["name"] == name:
                return node
        names = ", ".join(node["name"] for node in self.agent["nodes"]) or "none yet"
        raise EditError(f"There's no node named '{name}'. Nodes: {names}.")

    @staticmethod
    def _edge(node: dict[str, Any], function: str) -> dict[str, Any]:
        for edge in node["edges"]:
            if edge["function"] == function:
                return edge
        raise EditError(
            f"'{node['name']}' has no action named '{function}'. Its actions: "
            f"{_functions(node) or 'none'}."
        )

    def _check_new_name(self, name: str) -> None:
        if not NAME_PATTERN.fullmatch(name):
            raise EditError(f"Node name '{name}' must be snake_case (a-z, 0-9, _).")
        if any(node["name"] == name for node in self.agent["nodes"]):
            raise EditError(f"A node named '{name}' already exists.")

    def _check_target(self, source: dict[str, Any], target: str) -> None:
        self._node(target)
        if source.get("end"):
            raise EditError(f"'{source['name']}' is an end node; it can't lead anywhere.")
        if target == source["name"]:
            raise EditError("An action must move to another node, not back to its own.")
        if target == self.agent.get("initial_node"):
            raise EditError(f"'{target}' is the start node; nothing can lead into it.")

    def _rename(self, old: str, new: str) -> None:
        self._node(old)["name"] = new
        for node in self.agent["nodes"]:
            for edge in node["edges"]:
                if edge["target"] == old:
                    edge["target"] = new
        if self.agent.get("initial_node") == old:
            self.agent["initial_node"] = new


def _fields(fields: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    """Copilot field specs -> JSON-schema `properties` + `required`."""
    properties: dict[str, Any] = {}
    required: list[str] = []
    for spec in fields:
        name = spec.get("name", "")
        if not NAME_PATTERN.fullmatch(name):
            raise EditError(f"Field name '{name}' must be snake_case (a-z, 0-9, _).")
        if name in properties:
            raise EditError(f"Field '{name}' is listed twice.")
        kind = spec.get("type", "string")
        if kind not in FIELD_TYPES:
            raise EditError(f"Field '{name}' has type '{kind}'; use one of {', '.join(FIELD_TYPES)}.")
        schema: dict[str, Any] = {"type": kind, "description": spec.get("description", "")}
        if spec.get("enum"):
            schema["enum"] = list(spec["enum"])
        properties[name] = schema
        if spec.get("required", True):
            required.append(name)
    return properties, required


def _functions(node: dict[str, Any]) -> str:
    return ", ".join(edge["function"] for edge in node["edges"])


def _join(items: list[str]) -> str:
    if len(items) < 2:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]

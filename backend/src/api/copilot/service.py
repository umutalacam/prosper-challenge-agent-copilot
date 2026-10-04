#
# CopilotService — one copilot turn: the user's prompt + the editor's current agent
# in, a stream of events out. The model (OpenAI) edits the agent only through the
# tools below (applied by AgentEdits) or asks the user with ask_user, which ends
# the turn. Stateless: the browser keeps the conversation and sends it each turn.
#
# Events, in the order they can happen:
#   {"type": "activity", "text": "Thinking…"}            what it's doing right now
#   {"type": "note", "text": "..."}                      the model's own words mid-turn
#   {"type": "step", "text": "Added node 'x'", "ok": true}   an edit (ok=false: refused)
#   {"type": "agent", "agent": {...}}                    the agent after that edit
#   {"type": "reply", "text": "..."}                     the turn's closing message
#   {"type": "questions", "questions": [{"question": "...", "options": [...]}]}
#   {"type": "error", "message": "..."}
#   {"type": "done"}
#

import json
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from loguru import logger

from agent_builder import AgentBuilder

from .edits import AgentEdits, EditError

MAX_MODEL_CALLS = 20  # per turn: tool round-trips before the copilot gives up
MAX_VALIDATION_RETRIES = 2
MAX_COMPLETENESS_NUDGES = 2  # times the model is sent back to finish a half-built flow

Event = dict[str, Any]

_FIELD_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "snake_case field name"},
        "type": {"type": "string", "enum": ["string", "number", "boolean"]},
        "description": {"type": "string", "description": "What the value is, for the voice agent"},
        "enum": {"type": "array", "items": {"type": "string"}, "description": "Allowed values, if fixed"},
        "required": {
            "type": "boolean",
            "description": "Default true. False if some callers may not be able to give it.",
        },
    },
    "required": ["name", "type", "description"],
}


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


_STR = {"type": "string"}

TOOLS = [
    _tool(
        "set_agent_settings",
        "Change the agent's name, persona (its system prompt for every call), LLM model or ElevenLabs voice id.",
        {"name": _STR, "persona": _STR, "model": _STR, "voice_id": _STR},
        [],
    ),
    _tool(
        "add_node",
        "Add a conversation step. Connect it with add_action afterwards.",
        {
            "name": {"type": "string", "description": "snake_case, unique"},
            "task": {"type": "string", "description": "What the agent does in this step, as instructions"},
            "end": {"type": "boolean", "description": "True if the call ends after this step"},
            "role_message": {"type": "string", "description": "Optional persona override for this step only"},
        },
        ["name", "task"],
    ),
    _tool(
        "update_node",
        "Change a node: rename it (actions follow), rewrite its task, set its persona override (empty string clears it) or make it an end node.",
        {"name": _STR, "new_name": _STR, "task": _STR, "role_message": _STR, "end": {"type": "boolean"}},
        ["name"],
    ),
    _tool(
        "delete_node",
        "Delete a node and every action leading to it. The start node can't be deleted.",
        {"name": _STR},
        ["name"],
    ),
    _tool(
        "add_action",
        "Connect two nodes: a function the voice agent calls to move from `source` to `target`, collecting `fields` from the caller first.",
        {
            "source": _STR,
            "target": _STR,
            "function": {"type": "string", "description": "snake_case, unique within the source node"},
            "description": {"type": "string", "description": "When the voice agent should call it"},
            "fields": {"type": "array", "items": _FIELD_SCHEMA},
        },
        ["source", "target", "function", "description"],
    ),
    _tool(
        "update_action",
        "Change an action: rename it, its description, its target, or replace its fields.",
        {
            "source": _STR,
            "function": _STR,
            "new_function": _STR,
            "description": _STR,
            "target": _STR,
            "fields": {"type": "array", "items": _FIELD_SCHEMA},
        },
        ["source", "function"],
    ),
    _tool(
        "delete_action",
        "Delete an action from a node.",
        {"source": _STR, "function": _STR},
        ["source", "function"],
    ),
    _tool(
        "ask_user",
        "Ask the user clarifying questions (at most three). This ends your turn; their answer comes as the next message.",
        {
            "questions": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "question": _STR,
                        "options": {
                            "type": "array",
                            "items": _STR,
                            "description": "Optional short suggested answers",
                        },
                    },
                    "required": ["question"],
                },
            }
        },
        ["questions"],
    ),
]

_EDIT_TOOLS: dict[str, Callable[..., str]] = {
    "set_agent_settings": AgentEdits.set_agent_settings,
    "add_node": AgentEdits.add_node,
    "update_node": AgentEdits.update_node,
    "delete_node": AgentEdits.delete_node,
    "add_action": AgentEdits.add_action,
    "update_action": AgentEdits.update_action,
    "delete_action": AgentEdits.delete_action,
}


class CopilotService:
    def __init__(self, client: Any, model: str, prompt_path: Path) -> None:
        self._client = client  # an openai.AsyncOpenAI (or a stand-in with the same call)
        self._model = model
        self._prompt_path = prompt_path

    async def run_turn(self, agent: dict[str, Any], messages: list[dict[str, str]]) -> AsyncIterator[Event]:
        """`messages`: the conversation so far, ending with the user's new prompt."""
        edits = AgentEdits(agent)
        chat = self._chat(edits.agent, messages)
        validation_retries = 0
        nudges = 0
        try:
            for _ in range(MAX_MODEL_CALLS):
                yield {"type": "activity", "text": "Thinking…"}
                response = await self._client.chat.completions.create(
                    model=self._model, messages=chat, tools=TOOLS
                )
                message = response.choices[0].message
                calls = message.tool_calls or []
                chat.append(_assistant_message(message.content, calls))

                if not calls:
                    error = _validation_error(edits.agent)
                    if error and validation_retries < MAX_VALIDATION_RETRIES:
                        validation_retries += 1
                        yield {"type": "activity", "text": "Checking the agent…"}
                        chat.append(
                            {
                                "role": "developer",
                                "content": f"The agent isn't valid yet: {error} Fix it with the tools, then reply.",
                            }
                        )
                        continue
                    gaps = _completeness_gaps(edits.agent) if not error else []
                    if gaps and nudges < MAX_COMPLETENESS_NUDGES:
                        nudges += 1
                        yield {"type": "activity", "text": "Finishing the flow…"}
                        chat.append(
                            {
                                "role": "developer",
                                "content": "The flow isn't finished: "
                                + " ".join(gaps)
                                + " Unless the user asked for only part of the agent, fix this"
                                " with the tools now, then reply.",
                            }
                        )
                        continue
                    if message.content:
                        yield {"type": "reply", "text": message.content}
                    if error:
                        yield {"type": "error", "message": f"The agent still isn't valid: {error}"}
                    break

                if message.content:
                    yield {"type": "note", "text": message.content}
                questions: list[dict[str, Any]] | None = None
                for call in calls:
                    name, args = call.function.name, _parse_args(call.function.arguments)
                    if name == "ask_user":
                        questions = args.get("questions") or []
                        result: dict[str, Any] = {"ok": True, "result": "Shown to the user."}
                    else:
                        result = self._apply(edits, name, args)
                        yield {"type": "step", "text": result.get("result") or result["error"], "ok": result["ok"]}
                        if result["ok"]:
                            yield {"type": "agent", "agent": edits.agent}
                    chat.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
                if questions is not None:
                    yield {"type": "questions", "questions": questions}
                    break
            else:
                yield {
                    "type": "reply",
                    "text": f"I stopped after {MAX_MODEL_CALLS} steps. Tell me how to continue.",
                }
        except Exception as error:  # the model call (network, auth, rate limit) or a bug
            logger.exception("Copilot turn failed")
            yield {"type": "error", "message": f"The copilot failed: {error}"}
        yield {"type": "done"}

    def _chat(self, agent: dict[str, Any], messages: list[dict[str, str]]) -> list[dict[str, Any]]:
        # The prompt file is read every turn, so edits to it apply without a restart.
        system = {"role": "system", "content": self._prompt_path.read_text()}
        snapshot = {
            "role": "developer",
            "content": "The current agent, as it is in the editor now:\n```json\n"
            + json.dumps(agent, indent=2)
            + "\n```",
        }
        # The snapshot goes right before the newest prompt, so it's the freshest context.
        return [system, *messages[:-1], snapshot, messages[-1]]

    @staticmethod
    def _apply(edits: AgentEdits, name: str, args: dict[str, Any]) -> dict[str, Any]:
        operation = _EDIT_TOOLS.get(name)
        if operation is None:
            return {"ok": False, "error": f"Unknown tool '{name}'."}
        try:
            return {"ok": True, "result": operation(edits, **args)}
        except EditError as error:
            return {"ok": False, "error": f"{name} refused: {error}"}
        except TypeError as error:  # unexpected or missing arguments
            return {"ok": False, "error": f"{name} got bad arguments: {error}"}


def _assistant_message(content: str | None, calls: list[Any]) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if calls:
        message["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.function.name, "arguments": call.function.arguments},
            }
            for call in calls
        ]
    return message


def _parse_args(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _completeness_gaps(agent: dict[str, Any]) -> list[str]:
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


def _validation_error(agent: dict[str, Any]) -> str | None:
    """AgentBuilder's verdict (the same check as saving), or None if valid."""
    try:
        AgentBuilder.from_dict(agent)
    except KeyError as error:
        return f"Missing required field {error}."
    except (ValueError, TypeError) as error:
        return str(error)
    return None

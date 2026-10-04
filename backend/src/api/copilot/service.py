#
# CopilotService — one copilot turn: the user's prompt + the editor's current agent
# in, a stream of events out. The model (OpenAI) edits the agent only through the
# tools in config/copilot_tools.json (applied by AgentEdits) or asks the user with
# ask_user, which ends the turn. Stateless: the browser keeps the conversation and sends it each turn.
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

# The tools in copilot_tools.json that edit the agent; ask_user is handled in the loop.
EDIT_TOOLS: dict[str, Callable[..., str]] = {
    "set_agent_settings": AgentEdits.set_agent_settings,
    "add_node": AgentEdits.add_node,
    "update_node": AgentEdits.update_node,
    "delete_node": AgentEdits.delete_node,
    "add_action": AgentEdits.add_action,
    "update_action": AgentEdits.update_action,
    "delete_action": AgentEdits.delete_action,
}


class CopilotService:
    def __init__(self, client: Any, model: str, prompt_path: Path, tools_path: Path) -> None:
        self._client = client  # an openai.AsyncOpenAI (or a stand-in with the same call)
        self._model = model
        self._prompt_path = prompt_path
        self._tools_path = tools_path

    async def run_turn(self, agent: dict[str, Any], messages: list[dict[str, str]]) -> AsyncIterator[Event]:
        """`messages`: the conversation so far, ending with the user's new prompt."""
        edits = AgentEdits(agent)
        chat = self._chat(edits.agent, messages)
        validation_retries = 0
        nudges = 0
        try:
            tools = load_tools(self._tools_path)  # a broken tools file is reported as an error event
            for _ in range(MAX_MODEL_CALLS):
                yield {"type": "activity", "text": "Thinking…"}
                response = await self._client.chat.completions.create(
                    model=self._model, messages=chat, tools=tools
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
        operation = EDIT_TOOLS.get(name)
        if operation is None:
            return {"ok": False, "error": f"Unknown tool '{name}'."}
        try:
            return {"ok": True, "result": operation(edits, **args)}
        except EditError as error:
            return {"ok": False, "error": f"{name} refused: {error}"}
        except TypeError as error:  # unexpected or missing arguments
            return {"ok": False, "error": f"{name} got bad arguments: {error}"}


def load_tools(path: Path) -> list[dict[str, Any]]:
    """The tools file, already in OpenAI's function-tool format. Read every turn, like the prompt."""
    return json.loads(path.read_text())


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

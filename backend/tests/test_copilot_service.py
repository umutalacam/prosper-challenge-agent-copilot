import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from api.copilot.service import CopilotService


def call(tool: str, /, **args) -> SimpleNamespace:
    return SimpleNamespace(id=f"call_{tool}", function=SimpleNamespace(name=tool, arguments=json.dumps(args)))


def reply(content: str | None = None, *calls: SimpleNamespace) -> SimpleNamespace:
    message = SimpleNamespace(content=content, tool_calls=list(calls) or None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class ScriptedModel:
    """Stands in for AsyncOpenAI: returns the scripted responses in order, records requests."""

    def __init__(self, *responses: SimpleNamespace) -> None:
        self.responses = list(responses)
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **request):
        self.requests.append(json.loads(json.dumps(request)))  # snapshot
        return self.responses.pop(0)


AGENT = {
    "name": "New agent",
    "initial_node": "greeting",
    "nodes": [{"name": "greeting", "task_messages": [], "edges": []}],
}


@pytest.fixture
def prompt(tmp_path: Path) -> Path:
    path = tmp_path / "prompt.md"
    path.write_text("You are the copilot.")
    return path


def run(model: ScriptedModel, prompt: Path, text: str = "Build it") -> list[dict]:
    service = CopilotService(model, "test-model", prompt)

    async def collect():
        return [event async for event in service.run_turn(AGENT, [{"role": "user", "content": text}])]

    return asyncio.run(collect())


def test_edits_stream_as_steps_with_the_agent_after_each(prompt: Path):
    model = ScriptedModel(
        reply("Setting it up.", call("add_node", name="wrap_up", task="Say bye.", end=True)),
        reply(None, call("add_action", source="greeting", target="wrap_up", function="finish", description="Done.")),
        reply("Added a goodbye step."),
    )
    events = run(model, prompt)
    kinds = [event["type"] for event in events]
    assert kinds == [
        "activity", "note", "step", "agent",
        "activity", "step", "agent",
        "activity", "reply", "done",
    ]
    assert events[2] == {"type": "step", "text": "Added end node 'wrap_up'", "ok": True}
    assert [n["name"] for n in events[6]["agent"]["nodes"]] == ["greeting", "wrap_up"]
    assert events[8] == {"type": "reply", "text": "Added a goodbye step."}


def test_the_prompt_file_and_the_current_agent_are_sent(prompt: Path):
    model = ScriptedModel(reply("Done."), reply("Still done."), reply("Really."))
    run(model, prompt, "Hello")
    messages = model.requests[0]["messages"]
    assert messages[0] == {"role": "system", "content": "You are the copilot."}
    assert messages[1]["role"] == "developer" and '"initial_node": "greeting"' in messages[1]["content"]
    assert messages[2] == {"role": "user", "content": "Hello"}
    assert {tool["function"]["name"] for tool in model.requests[0]["tools"]} >= {"add_node", "ask_user"}


def test_a_refused_edit_goes_back_to_the_model(prompt: Path):
    model = ScriptedModel(
        reply(None, call("delete_node", name="greeting")),
        reply("The start node has to stay."),
    )
    events = run(model, prompt)
    assert events[1] == {
        "type": "step",
        "text": "delete_node refused: 'greeting' is the start node and can't be deleted.",
        "ok": False,
    }
    tool_result = model.requests[1]["messages"][-1]
    assert tool_result["role"] == "tool" and '"ok": false' in tool_result["content"]


def test_ask_user_ends_the_turn_with_the_questions(prompt: Path):
    questions = [{"question": "Who calls this agent?", "options": ["Patients", "Staff"]}]
    model = ScriptedModel(reply("A couple of questions first.", call("ask_user", questions=questions)))
    events = run(model, prompt)
    assert events[-2:] == [{"type": "questions", "questions": questions}, {"type": "done"}]
    assert len(model.requests) == 1


def test_a_failing_model_call_is_reported(prompt: Path):
    class Broken(ScriptedModel):
        async def create(self, **request):
            raise RuntimeError("rate limited")

    events = run(Broken(), prompt)
    assert events[-2:] == [
        {"type": "error", "message": "The copilot failed: rate limited"},
        {"type": "done"},
    ]


def test_a_half_built_flow_is_sent_back_to_be_finished(prompt: Path):
    model = ScriptedModel(
        reply("I'll add the rest next."),  # greeting has no way out, no end node
        reply(None, call("add_node", name="bye", task="Say bye.", end=True)),
        reply(None, call("add_action", source="greeting", target="bye", function="done", description="Done.")),
        reply("Finished: greeting now leads to a goodbye."),
    )
    events = run(model, prompt)
    nudge = model.requests[1]["messages"][-1]
    assert nudge["role"] == "developer"
    assert "'greeting' has no actions" in nudge["content"] and "no end node" in nudge["content"]
    assert {"type": "activity", "text": "Finishing the flow…"} in events
    assert events[-2] == {"type": "reply", "text": "Finished: greeting now leads to a goodbye."}
    assert not any(e.get("text") == "I'll add the rest next." for e in events)


def test_the_nudge_gives_up_after_two_tries(prompt: Path):
    model = ScriptedModel(reply("Only the persona, as asked."), reply("Still only that."), reply("Yes, only that."))
    events = run(model, prompt)
    assert len(model.requests) == 3
    assert events[-2] == {"type": "reply", "text": "Yes, only that."}

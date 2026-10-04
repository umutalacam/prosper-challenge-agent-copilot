"""A whole copilot turn through the node graph, with a scripted model."""

import asyncio
import shutil
from pathlib import Path

from api.copilot.service import CopilotService
from config import COPILOT_DIR

from tests.copilot_fakes import AGENT, ScriptedModel, call, plan, reply, review, route


def run(model: ScriptedModel, text: str = "Build it", config: Path = COPILOT_DIR, agent: dict = AGENT) -> list[dict]:
    service = CopilotService(model, "test-model", config)

    async def collect():
        return [event async for event in service.run_turn(agent, [{"role": "user", "content": text}])]

    return asyncio.run(collect())


def build_responses(*review_answers) -> list:
    """A build that adds a goodbye node and connects it, then the given reviews."""
    return [
        plan("Add end node bye", "Connect greeting to bye"),
        reply("Adding it.", call("add_node", name="bye", task="Say bye.", end=True)),
        reply(None, call("add_action", source="greeting", target="bye", function="done", description="Done.")),
        reply("All done."),
        *review_answers,
    ]


def test_a_build_runs_plan_execute_review_wrap_up():
    model = ScriptedModel(route("build"), *build_responses(review()), reply("Added a goodbye step."))
    events = run(model)
    assert [event["type"] for event in events] == [
        "activity", "activity", "note",  # understand, plan, the plan
        "activity", "note", "step", "agent",  # build: add_node
        "activity", "step", "agent",  # build: add_action
        "activity",  # build: done
        "activity", "activity", "reply", "done",  # review, wrap up
    ]
    assert [e["text"] for e in events if e["type"] == "activity"] == [
        "Understanding the request…", "Planning…", "Building…", "Building…", "Building…", "Reviewing…", "Wrapping up…",
    ]
    assert events[2] == {"type": "note", "text": "Plan:\n1. Add end node bye\n2. Connect greeting to bye"}
    assert events[5] == {"type": "step", "text": "Added end node 'bye'", "ok": True}
    assert events[-2] == {"type": "reply", "text": "Added a goodbye step."}
    assert [n["name"] for n in events[9]["agent"]["nodes"]] == ["greeting", "bye"]


def test_each_node_gets_its_own_prompt_and_the_current_agent():
    model = ScriptedModel(route("build"), *build_responses(review()), reply("Done."))
    run(model, "Hello")
    first = model.requests[0]["messages"]
    assert first[0]["role"] == "system" and "# Your step: understand the request" in first[0]["content"]
    assert first[1]["role"] == "developer" and '"initial_node": "greeting"' in first[1]["content"]
    assert first[2] == {"role": "user", "content": "Hello"}
    systems = [request["messages"][0]["content"] for request in model.requests]
    assert "# Your step: plan the change" in systems[1]
    assert "# Your step: build" in systems[2]
    assert "# Your step: review" in systems[5]
    assert "# Your step: reply to the user" in systems[6]


def test_clarify_asks_and_ends_the_turn():
    question = {"question": "Who calls this agent?", "options": ["Patients", "Staff"]}
    model = ScriptedModel(route("clarify", question, {"question": "What tone?", "options": []}))
    events = run(model)
    assert events[-2:] == [
        {"type": "questions", "questions": [question, {"question": "What tone?"}]},
        {"type": "done"},
    ]
    assert len(model.requests) == 1


def test_explain_answers_without_editing():
    model = ScriptedModel(route("explain"), reply("greeting is where every call starts."))
    events = run(model, "What does greeting do?")
    assert [e["type"] for e in events] == ["activity", "activity", "reply", "done"]
    assert events[-2] == {"type": "reply", "text": "greeting is where every call starts."}
    assert len(model.requests) == 2  # wrap_up sends the explainer's answer, no extra call


def test_review_issues_go_back_to_the_planner():
    model = ScriptedModel(
        route("build"),
        plan("Write the greeting"),
        reply("Nothing to do."),
        review("greeting has no way out"),
        *build_responses(review()),
        reply("Fixed the dead end."),
    )
    events = run(model)
    replan = model.requests[4]["messages"][-1]
    assert replan["role"] == "developer" and "- greeting has no way out" in replan["content"]
    assert events[-2] == {"type": "reply", "text": "Fixed the dead end."}


def test_the_review_loop_gives_up_after_three_reviews():
    stuck = [plan("Try"), reply("Tried."), review("still broken")]
    model = ScriptedModel(route("build"), *stuck, *stuck, *stuck, reply("I couldn't fix it."))
    events = run(model)
    wrap_up = model.requests[-1]["messages"][-1]["content"]
    assert "Problems the review couldn't fix:\n- still broken" in wrap_up
    assert events[-2] == {"type": "reply", "text": "I couldn't fix it."}


def test_a_failing_model_call_is_reported():
    class Broken(ScriptedModel):
        async def create(self, **request):
            raise RuntimeError("rate limited")

    events = run(Broken())
    assert events[-2:] == [{"type": "error", "message": "The copilot failed: rate limited"}, {"type": "done"}]


def test_an_unreadable_decision_is_reported():
    events = run(ScriptedModel(reply("build, I think")))
    assert events[-2]["type"] == "error" and "wasn't valid JSON" in events[-2]["message"]
    assert events[-1] == {"type": "done"}


def test_a_broken_config_file_is_reported(tmp_path: Path):
    config = tmp_path / "copilot"
    shutil.copytree(COPILOT_DIR, config)
    (config / "schemas.json").write_text("{")
    events = run(ScriptedModel(), config=config)
    assert events[-2]["type"] == "error"
    assert events[-1] == {"type": "done"}

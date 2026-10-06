"""A whole copilot turn through the node graph, with a scripted model."""

import asyncio
import json
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
        reply("Adding it.", call("add_node", name="bye", tasks=["Say bye."], end=True)),
        reply(None, call("add_action", source="greeting", target="bye", function="done", description="Done.")),
        reply("All done."),
        *review_answers,
    ]


def test_a_build_runs_plan_execute_review_wrap_up():
    model = ScriptedModel(route("build"), *build_responses(review()), reply("Added a goodbye step."))
    events = run(model)
    assert [event["type"] for event in events] == [
        "activity", "note", "activity",  # understand, the goal, plan
        "activity", "note", "step", "agent",  # build: add_node
        "activity", "step", "agent",  # build: add_action
        "activity",  # build: done
        "activity", "activity", "reply", "done",  # review, wrap up
    ]
    assert [e["text"] for e in events if e["type"] == "activity"] == [
        "Understanding the request…", "Planning…", "Building…", "Building…", "Building…", "Reviewing…", "Wrapping up…",
    ]
    assert events[1] == {"type": "note", "text": "Goal: Build it"}
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


def test_a_fix_starts_at_the_fix_node_and_runs_the_build_loop():
    finding = {
        "call_id": "c1",
        "node": "greeting",
        "step": 0,
        "cause": "No way to end.",
        "suggestion": "Add a bye.",
    }
    model = ScriptedModel(*build_responses(review()), reply("Added a goodbye so the call can end."))
    service = CopilotService(model, "test-model", COPILOT_DIR)

    async def collect():
        messages = [{"role": "user", "content": "Fix greeting: No way to end."}]
        return [event async for event in service.run_turn(AGENT, messages, finding)]

    events = asyncio.run(collect())
    assert [e["text"] for e in events if e["type"] == "activity"] == [
        "Reading the finding…", "Planning…", "Building…", "Building…", "Building…", "Reviewing…", "Wrapping up…",
    ]
    assert not any(e["type"] == "note" and e["text"].startswith("Goal:") for e in events)
    # No resolve_intent: the first model call is the planner's, and it gets the goal.
    first = model.requests[0]["messages"]
    assert "# Your step: plan the change" in first[0]["content"]
    assert "Suggested fix: Add a bye." in first[-1]["content"]
    assert events[-2] == {"type": "reply", "text": "Added a goodbye so the call can end."}


GROUP = {"kind": "stuck", "node": "greeting", "version": 2, "call_count": 3, "causes": ["No way out."]}


def group_turn(model: ScriptedModel, group: dict, text: str) -> list[dict]:
    """:param model: The scripted client.
    :param group: The ``group_fix`` sent.
    :param text: The user's message.
    :return: The turn's events.
    """
    service = CopilotService(model, "test-model", COPILOT_DIR)

    async def collect():
        return [event async for event in service.run_turn(AGENT, [{"role": "user", "content": text}], group_fix=group)]

    return asyncio.run(collect())


def test_a_group_fix_proposes_a_fix_and_leaves_the_conversation_open():
    answer = {"reason": "r", "common_cause": "greeting has no action.", "suggestion": "Add a goodbye action."}
    model = ScriptedModel(reply(json.dumps(answer)))
    events = group_turn(model, GROUP, 'Fix "Stuck in greeting" across 3 calls (v2).')
    assert [e["type"] for e in events] == ["activity", "note", "reply", "proposal", "done"]
    assert len(model.requests) == 1  # one model call; nothing is built yet
    assert "# Your step: propose one fix" in model.requests[0]["messages"][0]["content"]


def test_a_reply_while_a_fix_is_proposed_is_talked_over_then_built_once_agreed():
    talk = ScriptedModel(reply(json.dumps({"reason": "r", "agreed": False, "suggestion": "X", "reply": "Hmm?"})))
    events = group_turn(talk, GROUP | {"proposal": "Add a goodbye action."}, "What about a handoff?")
    assert [e["type"] for e in events] == ["activity", "reply", "proposal", "done"]
    assert "# Your step: talk over the proposed fix" in talk.requests[0]["messages"][0]["content"]

    agreed = {"reason": "r", "agreed": True, "suggestion": "Add a goodbye action.", "reply": ""}
    build = ScriptedModel(reply(json.dumps(agreed)), *build_responses(review()), reply("Added the goodbye."))
    events = group_turn(build, GROUP | {"proposal": "Add a goodbye action."}, "Yes, go ahead")
    assert [e["text"] for e in events if e["type"] == "activity"] == [
        "Thinking it over…", "Planning…", "Building…", "Building…", "Building…", "Reviewing…", "Wrapping up…",
    ]
    assert not any(e["type"] == "proposal" for e in events)  # built: the conversation closes
    assert events[-2] == {"type": "reply", "text": "Added the goodbye."}

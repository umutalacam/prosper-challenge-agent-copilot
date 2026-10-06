"""Each copilot node on its own: run on a hand-built Turn, and next as a pure function."""

import asyncio
import json
import copy

import pytest

from api.copilot.edits import AgentEdits
from api.copilot.model import CopilotError, CopilotModel
from api.copilot.nodes import (
    ExecutorNode,
    ExplainerNode,
    DiscussFixNode,
    FixNode,
    GroupFixNode,
    PlannerNode,
    ResolveIntentNode,
    ReviewerNode,
    WrapUpNode,
)
from api.copilot.nodes.reviewer import MAX_REVIEWS
from api.copilot.prompts import PromptLibrary
from api.copilot.turn import Turn
from config import COPILOT_DIR

from tests.copilot_fakes import AGENT, ScriptedModel, call, plan, reply, review, route, run_node

PROMPTS = PromptLibrary(COPILOT_DIR)


def make(node_class, *responses):
    model = ScriptedModel(*responses)
    return node_class(CopilotModel(model, "test-model"), PROMPTS), model


def turn(agent: dict = AGENT, **state) -> Turn:
    return Turn(AgentEdits(agent), [{"role": "user", "content": "Build it"}], **state)


# ---- next: the graph's edges ------------------------------------------------


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ({"intent": "build"}, "planner"),
        ({"intent": "explain"}, "explainer"),
        ({"intent": "clarify", "questions": [{"question": "Who calls?"}]}, None),
        ({"intent": "clarify"}, "explainer"),  # nothing to ask: answer instead
        ({"intent": "dance"}, "explainer"),
    ],
)
def test_resolve_intent_routes(state, expected):
    node, _ = make(ResolveIntentNode)
    assert node.next(turn(**state)) == expected


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ({"issues": [], "reviews": 1}, "wrap_up"),
        ({"issues": ["x"], "reviews": 1}, "planner"),
        ({"issues": ["x"], "reviews": MAX_REVIEWS - 1}, "planner"),
        ({"issues": ["x"], "reviews": MAX_REVIEWS}, "wrap_up"),
    ],
)
def test_reviewer_sends_issues_back_until_it_gives_up(state, expected):
    node, _ = make(ReviewerNode)
    assert node.next(turn(**state)) == expected


def test_the_fixed_edges():
    t = turn()
    assert make(PlannerNode)[0].next(t) == "executor"
    assert make(ExecutorNode)[0].next(t) == "reviewer"
    assert make(ExplainerNode)[0].next(t) == "wrap_up"
    assert make(WrapUpNode)[0].next(t) is None


# ---- run: each node's work ----------------------------------------------------


def test_deciding_nodes_ask_for_json_matching_their_schema_without_tools():
    node, model = make(ResolveIntentNode, route("build"))
    run_node(node, turn())
    request = model.requests[0]
    assert "tools" not in request
    assert request["response_format"]["type"] == "json_schema"
    assert request["response_format"]["json_schema"]["name"] == "resolve_intent"
    assert request["response_format"]["json_schema"]["strict"] is True


def test_a_refusal_stops_the_turn():
    node, model = make(ResolveIntentNode, reply(None))
    model.responses[0].choices[0].message.refusal = "I can't help with that."
    with pytest.raises(CopilotError, match="refused"):
        run_node(node, turn())


def test_resolve_intent_records_the_goal():
    node, _ = make(ResolveIntentNode, route("build", goal="A dental booking agent for patients"))
    t = turn()
    events = run_node(node, t)
    assert t.intent == "build" and t.goal == "A dental booking agent for patients"
    assert events == [
        {"type": "activity", "text": "Understanding the request…"},
        {"type": "note", "text": "Goal: A dental booking agent for patients"},
    ]


def test_resolve_intent_marks_multiple_choice_questions():
    questions = [
        {"question": "Which requests should it handle?", "options": ["Booking", "Rescheduling"], "multiple": True},
        {"question": "What tone?", "options": ["Warm", "Formal"], "multiple": False},
        {"question": "Anything else?", "options": [], "multiple": True},  # no options: nothing to pick
    ]
    node, _ = make(ResolveIntentNode, route("clarify", *questions))
    t = turn()
    run_node(node, t)
    assert t.questions == [
        {"question": "Which requests should it handle?", "options": ["Booking", "Rescheduling"], "multiple": True},
        {"question": "What tone?", "options": ["Warm", "Formal"]},
        {"question": "Anything else?"},
    ]


def test_resolve_intent_passes_every_question_on():
    questions = [{"question": f"Q{i}?", "options": []} for i in range(5)]
    node, _ = make(ResolveIntentNode, route("clarify", *questions))
    t = turn()
    events = run_node(node, t)
    assert [q["question"] for q in t.questions] == ["Q0?", "Q1?", "Q2?", "Q3?", "Q4?"]
    assert events[-1] == {"type": "questions", "questions": t.questions}


def test_the_planner_records_the_plan_without_showing_it_and_sees_the_goal_and_issues():
    node, model = make(PlannerNode, plan("Add node bye"))
    t = turn(goal="A dental booking agent", issues=["greeting has no way out"])
    events = run_node(node, t)
    assert t.plan == ["Add node bye"]
    assert events == [{"type": "activity", "text": "Planning…"}]
    last = model.requests[0]["messages"][-1]
    assert last["role"] == "developer" and last["content"].startswith("The user wants: A dental booking agent")
    assert "- greeting has no way out" in last["content"]


def test_the_executor_gets_the_plan_and_only_the_edit_tools():
    node, model = make(ExecutorNode, reply("Nothing to do."))
    run_node(node, turn(plan=["Rename the agent"]))
    request = model.requests[0]
    assert "response_format" not in request
    assert {tool["function"]["name"] for tool in request["tools"]} == {
        "set_agent_settings", "add_node", "update_node", "delete_node", "add_action", "update_action", "delete_action",
    }
    assert request["messages"][-1]["content"] == "Carry out this plan:\n1. Rename the agent"


def test_a_refused_edit_goes_back_to_the_model():
    node, model = make(ExecutorNode, reply(None, call("delete_node", name="greeting")), reply("The start stays."))
    t = turn()
    events = run_node(node, t)
    assert events[1] == {
        "type": "step",
        "text": "delete_node refused: 'greeting' is the start node and can't be deleted.",
        "ok": False,
    }
    tool_result = model.requests[1]["messages"][-1]
    assert tool_result["role"] == "tool" and '"ok": false' in tool_result["content"]
    assert t.steps == []  # only applied edits count


def test_the_reviewer_sends_an_invalid_agent_back_without_asking_the_model():
    invalid = copy.deepcopy(AGENT) | {"initial_node": "missing"}
    node, model = make(ReviewerNode)
    t = turn(invalid)
    run_node(node, t)
    assert model.requests == []
    assert t.issues and t.issues[0].startswith("The agent isn't valid:")
    assert node.next(t) == "planner"


def test_the_reviewer_sees_the_goal_the_plan_the_edits_and_the_gaps():
    node, model = make(ReviewerNode, review())
    t = turn(goal="A friendly greeting", plan=["Write the greeting"], steps=["Updated node 'greeting'"], issues=["old"])
    run_node(node, t)
    context = model.requests[0]["messages"][-1]["content"]
    assert context.startswith("The user wants: A friendly greeting")
    assert "The plan was:\n1. Write the greeting" in context
    assert "Edits made this turn:\n- Updated node 'greeting'" in context
    assert "Automatic checks found:" in context and "'greeting' has no actions" in context
    assert t.issues == [] and t.reviews == 1


def test_wrap_up_sends_a_written_reply_without_a_model_call():
    node, model = make(WrapUpNode)
    events = run_node(node, turn(reply="It starts at greeting.", intent="explain"))
    assert events == [{"type": "reply", "text": "It starts at greeting."}]
    assert model.requests == []


def test_wrap_up_reports_a_build_that_is_still_invalid():
    invalid = copy.deepcopy(AGENT) | {"initial_node": "missing"}
    node, _ = make(WrapUpNode, reply("I tried."))
    events = run_node(node, turn(invalid, intent="build"))
    assert events[-2] == {"type": "reply", "text": "I tried."}
    assert events[-1]["type"] == "error" and "still isn't valid" in events[-1]["message"]


def test_nodes_run_concurrently_without_sharing_state():
    """Nodes keep no per-turn state; two turns on one node don't mix."""
    node, _ = make(PlannerNode, plan("A"), plan("B"))
    first, second = turn(), turn()

    async def both():
        await asyncio.gather(*(_drain(node, t) for t in (first, second)))

    asyncio.run(both())
    assert {tuple(first.plan), tuple(second.plan)} == {("A",), ("B",)}


async def _drain(node, t):
    async for _ in node.run(t):
        pass


# ---- fix: a finding from a call's AI analysis starts the turn -----------------

FINDING = {
    "call_id": "c1",
    "node": "greeting",
    "step": 0,
    "cause": "The caller asked about insurance; greeting has no action for it.",
    "suggestion": "Add an action for insurance questions.",
}


def test_fix_turns_the_finding_into_a_build_goal_without_a_model_call():
    node, model = make(FixNode)
    t = turn(fix=FINDING)
    events = run_node(node, t)
    assert t.intent == "build"
    assert t.goal == (
        "Fix a problem a real call ran into in node 'greeting': The caller asked about insurance;"
        " greeting has no action for it. Suggested fix: Add an action for insurance questions."
    )
    assert events == [{"type": "activity", "text": "Reading the finding…"}]  # the card shows the finding
    assert model.requests == []
    assert node.next(t) == "planner"


def test_fix_goal_without_a_node_or_suggestion():
    assert FixNode.goal_of({"node": None, "cause": "The call failed.", "suggestion": ""}) == (
        "Fix a problem a real call ran into: The call failed."
    )


# ---- group_fix: an issue across calls proposes one fix and asks ----------------

GROUP = {
    "kind": "stuck",
    "node": "greeting",
    "version": 4,
    "call_count": 3,
    "causes": ["Asked for the date of birth twice.", "No action for insurance questions."],
}


def test_group_fix_proposes_one_fix_in_conversation():
    answer = {"reason": "r", "common_cause": "greeting only handles bookings.", "suggestion": "Add an action."}
    node, model = make(GroupFixNode, reply(json.dumps(answer)))
    t = turn(group_fix=GROUP)
    events = run_node(node, t)

    context = model.requests[0]["messages"][-1]["content"]
    assert "version 4 of the agent, 3 calls got stuck" in context and "in node 'greeting'" in context
    assert "- No action for insurance questions." in context
    assert events[1:] == [
        {"type": "note", "text": "Common cause: greeting only handles bookings."},
        {"type": "reply", "text": "I'd suggest: Add an action.\n\nWant me to apply it, or would you change something?"},
        {"type": "proposal", "suggestion": "Add an action."},
    ]
    assert node.next(t) is None  # the user replies; discuss_fix takes it from there


def discuss(answer: dict) -> tuple[Turn, list, ScriptedModel, DiscussFixNode]:
    """Run discuss_fix on GROUP with a proposal open.

    :param answer: The model's decision.
    :return: The turn, its events, the model and the node.
    """
    node, model = make(DiscussFixNode, reply(json.dumps({"reason": "r", **answer})))
    t = turn(group_fix=GROUP | {"proposal": "Add an action."})
    return t, run_node(node, t), model, node


def test_discuss_fix_answers_and_revises_until_the_user_agrees():
    t, events, model, node = discuss(
        {"agreed": False, "suggestion": "Add an action, and mention opening hours.", "reply": "Good idea. Apply it?"}
    )
    assert "The fix proposed so far: Add an action." in model.requests[0]["messages"][-1]["content"]
    assert events[1:] == [
        {"type": "reply", "text": "Good idea. Apply it?"},
        {"type": "proposal", "suggestion": "Add an action, and mention opening hours."},
    ]
    assert node.next(t) is None and t.intent is None


def test_discuss_fix_builds_the_agreed_fix():
    t, events, _, node = discuss({"agreed": True, "suggestion": "Add an action.", "reply": ""})
    assert (t.intent, t.goal) == ("build", "Apply the fix agreed with the user: Add an action.")
    assert events[1:] == [{"type": "note", "text": f"Goal: {t.goal}"}]  # no proposal: the conversation closes
    assert node.next(t) == "planner"


import asyncio
import json

import pytest

from api.calls.analyzer import CallAnalyzer
from api.copilot.model import CopilotError
from tests.conftest import make_agent, make_copilot_analyzer, make_call
from tests.copilot_fakes import ScriptedModel, reply

ANSWER = {
    "reason": "r",
    "summary": "The bot kept greeting.",
    "findings": [{"node": "n0", "step": 0, "cause": "No action fits.", "suggestion": "Add one."}],
}


def analyze(model: ScriptedModel):
    """Analyze a call that got stuck in ``n0``.

    :param model: The scripted OpenAI stand-in.
    :return: The analysis.
    """
    record = make_call("c1", stuck_in="n0")
    analyzer = CallAnalyzer()
    copilot_analyzer = make_copilot_analyzer(model)
    issues, steps = analyzer.issues(record), analyzer.steps(record)
    return asyncio.run(copilot_analyzer.analyze(record, make_agent("Desk"), issues, steps))


def test_the_answer_becomes_a_done_analysis():
    analysis = analyze(ScriptedModel(reply(json.dumps(ANSWER))))
    assert (analysis.status, analysis.summary, analysis.findings, analysis.model) == (
        "done",
        "The bot kept greeting.",
        ANSWER["findings"],
        "test-model",
    )


def test_the_model_gets_the_agent_the_issues_and_the_transcript_with_a_strict_schema():
    model = ScriptedModel(reply(json.dumps(ANSWER)))
    analyze(model)
    request = model.requests[0]
    system, agent, call = (m["content"] for m in request["messages"])
    assert "`stuck`" in system
    assert '"initial_node": "n0"' in agent
    facts = json.loads(call.split("```json\n")[1].split("\n```")[0])
    assert facts["issues"] == [{"kind": "stuck", "node": "n0", "step": 0, "at_ms": 900, "replies": 3}]
    assert facts["transcript"][0]["text"] == "Hi"
    assert request["response_format"]["json_schema"]["strict"] is True


def test_a_refusal_raises():
    refusing = ScriptedModel(reply(json.dumps(ANSWER)))
    refusing.responses[0].choices[0].message.refusal = "No."
    with pytest.raises(CopilotError, match="refused"):
        analyze(refusing)

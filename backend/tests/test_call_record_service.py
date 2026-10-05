import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from api.agents.repository import AgentRepository
from api.agents.service import AgentService
from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallAnalysis, CallIssue, CallNotFound, CallRepository
from api.calls.service import CallRecordService
from tests.conftest import make_agent, make_copilot_analyzer, make_call as call
from tests.copilot_fakes import ScriptedModel, reply

ANSWER = {
    "reason": "The caller never gave a date of birth.",
    "summary": "The bot kept asking for a date of birth the caller didn't want to give.",
    "findings": [
        {"node": "n0", "step": 0, "cause": "No action for a caller who refuses.", "suggestion": "Add one."},
    ],
}


@pytest.fixture
def db(tmp_path: Path) -> Path:
    """A database with the agent ``desk`` at version 2 (the version test calls ran).

    :param tmp_path: The test's temporary directory.
    :return: The database path.
    """
    agents = AgentRepository(tmp_path / "calls.db")
    agents.create("desk", make_agent("Desk"))
    agents.update("desk", make_agent("Desk", nodes=2))
    return tmp_path / "calls.db"


@pytest.fixture
def agents(db: Path) -> AgentService:
    """:param db: The database with the agent.
    :return: The agent service on it.
    """
    return AgentService(AgentRepository(db))


@pytest.fixture
def calls(db: Path) -> CallRepository:
    """:param db: The database with the agent.
    :return: The call repository on it.
    """
    return CallRepository(db)


@pytest.fixture
def model() -> ScriptedModel:
    """:return: The OpenAI stand-in, answering one analysis."""
    return ScriptedModel(reply(json.dumps(ANSWER)))


@pytest.fixture
def service(calls: CallRepository, agents: AgentService, model: ScriptedModel) -> CallRecordService:
    """:param calls: Where calls are stored.
    :param agents: The agent service.
    :param model: The scripted model behind the copilot analyzer.
    :return: The service under test, with the real analyzer.
    """
    return CallRecordService(calls, agents, CallAnalyzer(), make_copilot_analyzer(model))


def test_a_saved_call_is_stored_with_the_issues_the_analyzer_found(service: CallRecordService, calls: CallRepository):
    asyncio.run(service.save(call("c1", stuck_in="n0")))
    assert calls.list_for_agent("desk")[0].issues == [CallIssue("stuck", "n0", 0, 900, replies=3)]


def test_a_call_whose_agent_was_deleted_meanwhile_is_skipped(
    service: CallRecordService, agents: AgentService, calls: CallRepository
):
    asyncio.run(service.save(call("kept")))
    agents.delete("desk")
    asyncio.run(service.save(call("late")))  # the call ended after its agent was deleted: no error, not stored
    with pytest.raises(CallNotFound):
        calls.get("late")


def test_a_full_call_carries_its_steps_and_issues(service: CallRecordService):
    asyncio.run(service.save(call("c1", stuck_in="n0")))
    response = service.to_response(service.get("desk", "c1"))
    assert [i["kind"] for i in response["issues"]] == ["stuck"]
    assert [s["node"] for s in response["steps"]] == ["n0"]


def test_the_call_is_stored_pending_while_the_model_works(
    service: CallRecordService, calls: CallRepository, model: ScriptedModel
):
    seen = []
    answer = model.create

    async def create(**request):
        seen.append(calls.get("c1").analysis.status)  # what a reader sees while the model works
        return await answer(**request)

    model.chat.completions.create = create
    asyncio.run(service.save(call("c1", stuck_in="n0")))
    assert seen == ["pending"]
    assert calls.get("c1").analysis.status == "done"


def test_saving_stores_the_models_analysis(service: CallRecordService, calls: CallRepository, model: ScriptedModel):
    asyncio.run(service.save(call("c1", stuck_in="n0")))

    analysis = calls.get("c1").analysis
    assert (analysis.status, analysis.summary, analysis.model) == ("done", ANSWER["summary"], "test-model")
    assert analysis.findings == ANSWER["findings"]
    # The model saw the agent at the version the call ran (2 nodes), not just the call.
    assert '"n1"' in model.requests[0]["messages"][1]["content"]
    assert service.to_response(calls.get("c1"))["analysis"] == {
        "status": "done",
        "summary": ANSWER["summary"],
        "findings": ANSWER["findings"],
        "error": None,
    }


def test_a_call_without_issues_is_not_analyzed(
    service: CallRecordService, calls: CallRepository, model: ScriptedModel
):
    asyncio.run(service.save(call("clean")))
    assert model.requests == []
    assert calls.get("clean").analysis is None
    assert service.to_response(calls.get("clean"))["analysis"] is None


def test_a_failing_model_leaves_a_failed_analysis(calls: CallRepository, agents: AgentService):
    refusing = ScriptedModel(reply(json.dumps(ANSWER)))
    refusing.responses[0].choices[0].message.refusal = "No."
    service = CallRecordService(calls, agents, CallAnalyzer(), make_copilot_analyzer(refusing))
    asyncio.run(service.save(call("c1", stuck_in="n0")))  # doesn't raise

    analysis = calls.get("c1").analysis
    assert analysis.status == "failed" and "refused" in analysis.error


def test_a_pending_analysis_that_never_finished_reads_as_failed(service: CallRecordService, calls: CallRepository):
    record = call("c1", stuck_in="n0")
    stale = datetime.now(UTC) - CallRecordService.ANALYSIS_TIMEOUT - timedelta(seconds=1)
    calls.save(replace(record, analysis=CallAnalysis(status="pending", updated_at=stale)), [])
    assert service.to_response(calls.get("c1"))["analysis"]["status"] == "failed"

    calls.set_analysis("c1", CallAnalysis.pending())  # a fresh one is still pending
    assert service.to_response(calls.get("c1"))["analysis"]["status"] == "pending"

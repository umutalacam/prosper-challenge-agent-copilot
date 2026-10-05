#
# CallRecordService — stored voice calls. The voice bot saves each call when it
# ends (``save``): the call is stored with the issues CallAnalyzer finds in it,
# then CopilotAnalyzer explains them (a call with issues is stored with a pending
# analysis, set to done or failed when the model answers). The routes
# (api/calls/routes.py) read them back, shaped by to_summary / to_response.
#

import asyncio
from collections.abc import Collection
from dataclasses import asdict, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from loguru import logger

from api.agents.repository import AgentNotFound
from api.agents.service import AgentService
from api.calls.copilot_analyzer import CopilotAnalyzer
from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallAnalysis, CallNotFound, CallRecord, CallRepository, CallSummary, Outcome


class CallRecordService:
    # A pending analysis older than this never finished (the server restarted mid-way): reported as failed.
    ANALYSIS_TIMEOUT = timedelta(minutes=2)

    def __init__(
        self,
        repository: CallRepository,
        agents: AgentService,
        analyzer: CallAnalyzer,
        copilot_analyzer: CopilotAnalyzer,
    ) -> None:
        """:param repository: Where calls are stored.
        :param agents: Used to check that a call's agent exists, and to read the version a call ran.
        :param analyzer: Judges each call: its steps and issues.
        :param copilot_analyzer: Explains a call's issues with a model.
        """
        self._repository = repository
        self._agents = agents
        self._analyzer = analyzer
        self._copilot_analyzer = copilot_analyzer

    async def save(self, record: CallRecord) -> None:
        """Store a finished call, then have its issues analyzed (if it has any). The
        database work runs off the event loop; the analysis waits for the model, so
        await it after the caller has hung up.

        :param record: The finished call.
        """
        if await asyncio.to_thread(self._store, record):
            await self._analyze(record)

    def _store(self, record: CallRecord) -> bool:
        """Store a finished call with its issues, and a pending analysis if it has any. A
        call whose agent was deleted while it ran isn't stored: deleting an agent deletes
        its calls, this one included.

        :param record: The finished call.
        :return: Whether it was stored.
        """
        try:
            self._agents.get(record.agent_id)
        except AgentNotFound:
            logger.warning(f"Call {record.id} not saved: agent '{record.agent_id}' was deleted during the call")
            return False
        issues = self._analyzer.issues(record)
        if issues:
            record = replace(record, analysis=CallAnalysis.pending())
        self._repository.save(record, issues)
        logger.info(f"Saved call {record.id} ({record.outcome}, {len(issues)} issues)")
        return True

    async def _analyze(self, record: CallRecord) -> None:
        """Have the model explain a stored call's issues and store the analysis: ``done``,
        or ``failed`` with the reason. Nothing to do for a call without issues. Never
        raises: the call is stored either way.

        :param record: The call, as ``_store`` stored it.
        """
        issues = self._analyzer.issues(record)
        if not issues:
            return
        try:
            agent = await asyncio.to_thread(self._agents.get_version, record.agent_id, record.agent_version)
            analysis = await self._copilot_analyzer.analyze(record, agent.body, issues, self._analyzer.steps(record))
        except Exception as error:
            logger.exception(f"Couldn't analyze call {record.id}")
            analysis = CallAnalysis.failed(f"{type(error).__name__}: {error}")
        try:
            await asyncio.to_thread(self._repository.set_analysis, record.id, analysis)
        except Exception:
            logger.exception(f"Couldn't store the analysis of call {record.id}")

    def list(
        self, agent_id: str, limit: int = 50, outcomes: Collection[Outcome] | None = None
    ) -> list[CallSummary]:
        """An agent's most recent calls, newest first.

        :param agent_id: The agent whose calls to list.
        :param limit: At most this many calls.
        :param outcomes: Only calls that ended one of these ways; None or empty for all.
        :return: The calls, without their timelines.
        :raises AgentNotFound: If there's no such agent.
        """
        self._agents.get(agent_id)
        return self._repository.list_for_agent(agent_id, limit, outcomes)

    def get(self, agent_id: str, call_id: str) -> CallRecord:
        """One of an agent's calls in full.

        :param agent_id: The agent the call belongs to.
        :param call_id: The call's id.
        :return: The call, with its transcript, timeline and final state.
        :raises AgentNotFound: If there's no such agent.
        :raises CallNotFound: If the agent has no such call (including another agent's).
        """
        self._agents.get(agent_id)
        record = self._repository.get(call_id)
        if record.agent_id != agent_id:
            raise CallNotFound(call_id)
        return record

    @staticmethod
    def to_summary(call: CallSummary) -> dict[str, Any]:
        """A listed call, as the API returns it.

        :param call: The call from ``list``.
        :return: Its JSON-ready fields.
        """
        return {
            "id": call.id,
            "agent_version": call.agent_version,
            "started_at": call.started_at.isoformat(),
            "duration_ms": call.duration_ms,
            "outcome": call.outcome,
            "end_node": call.end_node,
            "path": call.path,
            "issues": [asdict(issue) for issue in call.issues],
        }

    def to_response(self, call: CallRecord) -> dict[str, Any]:
        """One call in full, as the API returns it.

        :param call: The call from ``get``.
        :return: Its JSON-ready fields, with its issues, steps, analysis, transcript and timeline.
        """
        return {
            "id": call.id,
            "agent_id": call.agent_id,
            "agent_version": call.agent_version,
            "agent_name": call.agent_name,
            "started_at": call.started_at.isoformat(),
            "ended_at": call.ended_at.isoformat(),
            "duration_ms": call.duration_ms,
            "outcome": call.outcome,
            "end_node": call.end_node,
            "path": call.path,
            "issues": [asdict(issue) for issue in self._analyzer.issues(call)],
            "steps": self._analyzer.steps(call),
            "analysis": self._analysis_response(call.analysis),
            "transcript": call.transcript,
            "final_state": call.final_state,
            "events": call.events,
        }

    @staticmethod
    def _analysis_response(analysis: CallAnalysis | None) -> dict[str, Any] | None:
        """A call's analysis, as the API returns it.

        :param analysis: The stored analysis; None for a call without issues.
        :return: Its JSON-ready fields; a pending one past ``ANALYSIS_TIMEOUT`` reads as failed.
        """
        if analysis is None:
            return None
        stale = datetime.now(UTC) - analysis.updated_at > CallRecordService.ANALYSIS_TIMEOUT
        if analysis.status == "pending" and stale:
            analysis = CallAnalysis.failed("The analysis timed out.")
        return {
            "status": analysis.status,
            "summary": analysis.summary,
            "findings": analysis.findings,
            "error": analysis.error,
        }

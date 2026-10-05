#
# CallRecordService — stored voice calls. The voice bot saves each call when it
# ends; the routes (api/calls/routes.py) read them back, shaped by to_summary /
# to_response.
#

from collections.abc import Collection
from typing import Any

from loguru import logger

from api.agents.repository import AgentNotFound
from api.agents.service import AgentService
from api.calls.repository import CallNotFound, CallRecord, CallRepository, CallSummary, Outcome


class CallRecordService:
    def __init__(self, repository: CallRepository, agents: AgentService) -> None:
        """:param repository: Where calls are stored.
        :param agents: Used to check that a call's agent exists.
        """
        self._repository = repository
        self._agents = agents

    def save(self, record: CallRecord) -> None:
        """Store a finished call. A call whose agent was deleted while it ran isn't
        stored: deleting an agent deletes its calls, this one included.

        :param record: The finished call.
        """
        try:
            self._agents.get(record.agent_id)
        except AgentNotFound:
            logger.warning(f"Call {record.id} not saved: agent '{record.agent_id}' was deleted during the call")
            return
        self._repository.save(record)
        logger.info(f"Saved call {record.id} ({record.outcome})")

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
            "stuck_nodes": call.stuck_nodes,
        }

    @staticmethod
    def to_response(call: CallRecord) -> dict[str, Any]:
        """One call in full, as the API returns it.

        :param call: The call from ``get``.
        :return: Its JSON-ready fields, with the transcript and the timeline.
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
            "transcript": call.transcript,
            "final_state": call.final_state,
            "events": call.events,
        }

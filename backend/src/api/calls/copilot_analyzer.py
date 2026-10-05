#
# CopilotAnalyzer — the AI analysis of a call with issues: why each issue happened
# and what to change in the agent. CallAnalyzer finds the issues by fixed rules;
# this asks a model to explain them, from the agent as it was for the call, the
# call's steps and its transcript. CallRecordService runs it after the call is
# saved and stores the result.
#
# Its prompt and answer schema live in backend/config/calls/ (analysis.md,
# analysis_schema.json) and are read on every analysis, so edits apply without
# a restart.
#

import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger

from api.calls.repository import CallAnalysis, CallIssue, CallRecord
from api.copilot.model import CopilotModel


class CopilotAnalyzer:
    def __init__(self, model: CopilotModel, directory: Path, model_name: str) -> None:
        """:param model: The OpenAI caller (shared with the copilot).
        :param directory: The folder with ``analysis.md`` and ``analysis_schema.json``.
        :param model_name: The model's name, stored with each analysis.
        """
        self._model = model
        self._directory = directory
        self._model_name = model_name

    async def analyze(
        self, call: CallRecord, agent: dict[str, Any], issues: list[CallIssue], steps: list[dict[str, Any]]
    ) -> CallAnalysis:
        """Explain a call's issues.

        :param call: The finished call.
        :param agent: The agent's body at the version the call ran.
        :param issues: What went wrong (CallAnalyzer.issues).
        :param steps: The call's walk through the agent (CallAnalyzer.steps).
        :return: A ``done`` analysis: a summary and one finding per issue.
        :raises CopilotError: If the model refuses or its answer isn't valid JSON.
        """
        call_facts = {
            "outcome": call.outcome,
            "duration_ms": call.duration_ms,
            "issues": [{k: v for k, v in asdict(issue).items() if v is not None} for issue in issues],
            "steps": steps,
            "transcript": call.transcript,
        }
        chat = [
            {"role": "system", "content": (self._directory / "analysis.md").read_text()},
            {"role": "user", "content": "The agent:\n```json\n" + json.dumps(agent, indent=2) + "\n```"},
            {"role": "user", "content": "The call:\n```json\n" + json.dumps(call_facts, indent=2) + "\n```"},
        ]
        schema = json.loads((self._directory / "analysis_schema.json").read_text())
        answer = await self._model.decide(chat, "call_analysis", schema)
        logger.info(f"Analyzed call {call.id}: {answer['reason']}")
        return CallAnalysis(
            status="done",
            updated_at=datetime.now(UTC),
            summary=answer["summary"],
            findings=answer["findings"],
            model=self._model_name,
        )

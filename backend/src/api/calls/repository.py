#
# CallRepository — stored voice calls (SQLite, the `calls` table in
# config/schema.sql, in the same database as the agents). A call is written once,
# when it ends, together with its issues (`call_issues`, for counting failures
# across calls) and, if it has any, a pending AI analysis (`call_analyses`). Call
# rows are never updated; only the analysis is, once, when the model answers.
#

from __future__ import annotations

import json
import sqlite3
from collections.abc import Collection, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from config import SCHEMA_SQL

Event = dict[str, Any]  # one timeline entry; "type" says which (see api/calls/recorder.py)

# How a call ended (CallRecorder.outcome_of; "error" when the pipeline raised).
Outcome = Literal["completed", "abandoned", "not_started", "error"]

# What went wrong in a call (CallAnalyzer.issues; the call_issues table in schema.sql).
IssueKind = Literal["stuck", "long_stay", "error"]


@dataclass(frozen=True)
class CallIssue:
    """Something worth a look in a call, as CallAnalyzer judged it. ``stuck``: the bot
    improvised in the node the call ended in, unfinished (a failure); ``long_stay``: it
    improvised in a node but the call moved on (a note); ``error``: the pipeline raised."""

    kind: IssueKind
    node: str | None  # where it happened; None for an error before the flow started
    step: int | None  # its index in CallAnalyzer.steps; None if the flow never started
    at_ms: int
    replies: int | None = None  # stuck / long_stay: the bot reply that tipped it
    message: str | None = None  # error: what the pipeline raised


# Where a call's AI analysis is: ``pending`` while the model works, then ``done`` or
# ``failed`` — until a new customer flag sends it back to ``pending``.
AnalysisStatus = Literal["pending", "done", "failed"]


@dataclass(frozen=True)
class CallAnalysis:
    """The AI analysis of a call with issues (CopilotAnalyzer): why it went wrong and what
    to change in the agent."""

    status: AnalysisStatus
    updated_at: datetime
    summary: str | None = None  # done: what went wrong, in a few sentences
    findings: list[dict[str, Any]] = field(default_factory=list)  # done: {node, step, cause, suggestion}
    error: str | None = None  # failed: why there's no analysis
    model: str | None = None  # the model that wrote it

    @staticmethod
    def pending() -> CallAnalysis:
        """:return: An analysis that hasn't been written yet, as of now."""
        return CallAnalysis(status="pending", updated_at=datetime.now(UTC))

    @staticmethod
    def failed(error: str) -> CallAnalysis:
        """:param error: Why the analysis couldn't be written.
        :return: A failed analysis, as of now.
        """
        return CallAnalysis(status="failed", updated_at=datetime.now(UTC), error=error)


@dataclass(frozen=True)
class CallFlag:
    """A customer's report that a call went wrong."""

    id: int
    reason: str
    created_at: datetime


@dataclass(frozen=True)
class CallRecord:
    id: str
    agent_id: str
    agent_version: int
    agent_name: str
    started_at: datetime
    ended_at: datetime
    outcome: Outcome
    end_node: str | None
    path: list[str]
    final_state: dict[str, Any]
    events: list[Event]
    analysis: CallAnalysis | None = None  # only for calls with issues or flags
    flags: list[CallFlag] = field(default_factory=list)  # customers' reports, oldest first

    @property
    def duration_ms(self) -> int:
        """How long the call lasted, in milliseconds."""
        return CallRecord.milliseconds_between(self.started_at, self.ended_at)

    @staticmethod
    def milliseconds_between(started_at: datetime, ended_at: datetime) -> int:
        """The time between two moments, in whole milliseconds.

        :param started_at: The earlier moment.
        :param ended_at: The later moment.
        :return: The difference, rounded.
        """
        return round((ended_at - started_at).total_seconds() * 1000)

    @property
    def transcript(self) -> list[Event]:
        """What was said, in order, taken from the caller and bot events.

        :return: One ``{speaker, node, text, at_ms}`` per turn, with
            ``interrupted: True`` on bot turns the caller cut off.
        """
        return [
            {"speaker": e["type"], "node": e["node"], "text": e["text"], "at_ms": e["at_ms"]}
            | ({"interrupted": True} if e.get("interrupted") else {})
            for e in self.events
            if e["type"] in ("caller", "bot")
        ]


@dataclass(frozen=True)
class CallSummary:
    id: str
    agent_version: int
    started_at: datetime
    duration_ms: int
    outcome: Outcome
    end_node: str | None
    path: list[str]
    issues: list[CallIssue]
    flag_count: int = 0


class CallNotFound(Exception):
    def __init__(self, call_id: str) -> None:
        """:param call_id: The id that matched no stored call."""
        super().__init__(f"Call '{call_id}' not found.")


class CallRepository:
    """A short-lived connection per call, like AgentRepository, so one instance can be
    shared across FastAPI's worker threads and the voice bot's save thread."""

    def __init__(self, path: str | Path) -> None:
        """Open (creating if needed) the database and apply schema.sql.

        :param path: The SQLite file; the agents' database.
        """
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL.read_text())

    def save(self, record: CallRecord, issues: list[CallIssue]) -> None:
        """Store a finished call, with its issues and its analysis (if it has one).

        :param record: The call; its id must be new.
        :param issues: What went wrong in it (CallAnalyzer.issues).
        """
        with self._transaction() as conn:
            conn.execute(
                "INSERT INTO calls (id, agent_id, agent_version, agent_name, started_at, ended_at,"
                " outcome, end_node, path, final_state, events)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    record.id,
                    record.agent_id,
                    record.agent_version,
                    record.agent_name,
                    record.started_at.isoformat(timespec="milliseconds"),
                    record.ended_at.isoformat(timespec="milliseconds"),
                    record.outcome,
                    record.end_node,
                    json.dumps(record.path),
                    json.dumps(record.final_state),
                    json.dumps(record.events),
                ),
            )
            CallRepository._insert_issues(conn, record, issues)
            if record.analysis is not None:
                CallRepository._upsert_analysis(conn, record.id, record.analysis)

    def set_analysis(self, call_id: str, analysis: CallAnalysis) -> None:
        """Store a call's analysis, replacing the one it had (e.g. pending → done).

        :param call_id: The stored call.
        :param analysis: Its analysis.
        """
        with self._transaction() as conn:
            CallRepository._upsert_analysis(conn, call_id, analysis)

    def add_flag(self, call_id: str, reason: str) -> CallFlag:
        """Store a customer's flag on a call.

        :param call_id: The stored call.
        :param reason: What went wrong, in the customer's words.
        :return: The stored flag.
        """
        now = datetime.now(UTC)
        created_at = now.replace(microsecond=now.microsecond // 1000 * 1000)  # as stored: milliseconds
        with self._transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO call_flags (call_id, reason, created_at) VALUES (?, ?, ?)",
                (call_id, reason, created_at.isoformat(timespec="milliseconds")),
            )
        return CallFlag(id=cursor.lastrowid or 0, reason=reason, created_at=created_at)

    def list_for_agent(
        self, agent_id: str, limit: int = 50, outcomes: Collection[Outcome] | None = None
    ) -> list[CallSummary]:
        """An agent's calls, newest first, without their timelines.

        :param agent_id: The agent whose calls to list.
        :param limit: At most this many calls.
        :param outcomes: Only calls that ended one of these ways; None or empty for all.
        :return: The calls, each with its issues.
        """
        where, params = "agent_id = ?", [agent_id]
        if outcomes:
            where += f" AND outcome IN ({', '.join('?' * len(outcomes))})"
            params += list(outcomes)
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, agent_version, started_at, ended_at, outcome, end_node, path,"
                " (SELECT json_group_array(json_object('kind', kind, 'node', node, 'step', step,"
                "         'at_ms', at_ms, 'replies', replies, 'message', message))"
                "    FROM (SELECT * FROM call_issues WHERE call_id = calls.id ORDER BY rowid)) AS issues,"
                " (SELECT count(*) FROM call_flags WHERE call_id = calls.id) AS flag_count"
                f" FROM calls WHERE {where} ORDER BY started_at DESC LIMIT ?",
                (*params, limit),
            ).fetchall()
        return [
            CallSummary(
                id=r["id"],
                agent_version=r["agent_version"],
                started_at=datetime.fromisoformat(r["started_at"]),
                duration_ms=CallRecord.milliseconds_between(
                    datetime.fromisoformat(r["started_at"]), datetime.fromisoformat(r["ended_at"])
                ),
                outcome=r["outcome"],
                end_node=r["end_node"],
                path=json.loads(r["path"]),
                issues=[CallIssue(**issue) for issue in json.loads(r["issues"])],
                flag_count=r["flag_count"],
            )
            for r in rows
        ]

    def get(self, call_id: str) -> CallRecord:
        """One stored call in full.

        :param call_id: The call's id.
        :return: The call, with its timeline, final state, analysis and flags.
        :raises CallNotFound: If there's no such call.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT calls.*, a.status AS a_status, a.summary AS a_summary, a.findings AS a_findings,"
                " a.error AS a_error, a.model AS a_model, a.updated_at AS a_updated_at"
                " FROM calls LEFT JOIN call_analyses AS a ON a.call_id = calls.id WHERE calls.id = ?",
                (call_id,),
            ).fetchone()
            flags = conn.execute(
                "SELECT id, reason, created_at FROM call_flags WHERE call_id = ? ORDER BY id", (call_id,)
            ).fetchall()
        if row is None:
            raise CallNotFound(call_id)
        analysis = None
        if row["a_status"] is not None:
            analysis = CallAnalysis(
                status=row["a_status"],
                updated_at=datetime.fromisoformat(row["a_updated_at"]),
                summary=row["a_summary"],
                findings=json.loads(row["a_findings"]),
                error=row["a_error"],
                model=row["a_model"],
            )
        return CallRecord(
            id=row["id"],
            agent_id=row["agent_id"],
            agent_version=row["agent_version"],
            agent_name=row["agent_name"],
            started_at=datetime.fromisoformat(row["started_at"]),
            ended_at=datetime.fromisoformat(row["ended_at"]),
            outcome=row["outcome"],
            end_node=row["end_node"],
            path=json.loads(row["path"]),
            final_state=json.loads(row["final_state"]),
            events=json.loads(row["events"]),
            analysis=analysis,
            flags=[
                CallFlag(id=f["id"], reason=f["reason"], created_at=datetime.fromisoformat(f["created_at"]))
                for f in flags
            ],
        )

    @staticmethod
    def _upsert_analysis(conn: sqlite3.Connection, call_id: str, analysis: CallAnalysis) -> None:
        """:param conn: An open connection, inside a write transaction.
        :param call_id: The call the analysis belongs to.
        :param analysis: The analysis; replaces any the call had.
        """
        conn.execute(
            "INSERT OR REPLACE INTO call_analyses (call_id, status, summary, findings, error, model, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                call_id,
                analysis.status,
                analysis.summary,
                json.dumps(analysis.findings),
                analysis.error,
                analysis.model,
                analysis.updated_at.isoformat(timespec="milliseconds"),
            ),
        )

    @staticmethod
    def _insert_issues(conn: sqlite3.Connection, record: CallRecord, issues: list[CallIssue]) -> None:
        """:param conn: An open connection, inside a write transaction.
        :param record: The call the issues belong to.
        :param issues: Its issues.
        """
        conn.executemany(
            "INSERT INTO call_issues (call_id, agent_id, agent_version, kind, node, step, at_ms, replies, message)"
            " VALUES (:call_id, :agent_id, :agent_version, :kind, :node, :step, :at_ms, :replies, :message)",
            [
                {"call_id": record.id, "agent_id": record.agent_id, "agent_version": record.agent_version}
                | asdict(issue)
                for issue in issues
            ],
        )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """A connection for one operation, closed afterwards. Autocommit, foreign keys on.

        :return: The open connection, while the ``with`` block runs.
        """
        conn = sqlite3.connect(self.path, timeout=5.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        """A connection inside a write transaction (a call and its issues are stored
        together or not at all). Commits when the block ends, rolls back if it raises.

        :return: The connection, while the ``with`` block runs.
        """
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")

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


@dataclass(frozen=True)
class VersionStats:
    """How one version of an agent did: its calls, and how many ran into problems."""

    version: int
    call_count: int
    calls_with_issues: int  # calls with an issue or a customer flag


@dataclass(frozen=True)
class IssueGroup:
    """One kind of issue at one node, across a version's calls."""

    version: int
    kind: IssueKind
    node: str | None
    call_count: int  # calls it happened in
    new_count: int  # of those, calls that ended after the issues were last seen
    last_at: datetime  # when the latest of those calls ended
    calls: list[dict[str, Any]]  # the most recent ones, {id, ended_at}, newest first
    causes: list[str] = field(default_factory=list)  # what the AI analyses say caused it, newest call first


@dataclass(frozen=True)
class FlagEntry:
    """A customer's flag, with the call and version it's about."""

    version: int
    call_id: str
    reason: str
    created_at: datetime


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

    # ---- an agent's issues across its calls (the editor's Issues pane) ---------
    # An issue happened when its call ended (calls are stored then); a flag, when
    # it was made. Timestamps are ISO strings in UTC, so they compare as text.

    GROUP_CALLS = 20  # calls listed per issue group, newest first

    def version_stats(self, agent_id: str) -> list[VersionStats]:
        """:param agent_id: The agent.
        :return: Per version with calls, newest first: its calls and how many had problems.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT agent_version, count(*) AS call_count,"
                " sum(EXISTS (SELECT 1 FROM call_issues WHERE call_id = calls.id)"
                "     OR EXISTS (SELECT 1 FROM call_flags WHERE call_id = calls.id)) AS calls_with_issues"
                " FROM calls WHERE agent_id = ? GROUP BY agent_version ORDER BY agent_version DESC",
                (agent_id,),
            ).fetchall()
        return [VersionStats(r["agent_version"], r["call_count"], r["calls_with_issues"]) for r in rows]

    def issue_groups(self, agent_id: str, seen_at: datetime | None) -> list[IssueGroup]:
        """An agent's issues, grouped by version, kind and node.

        :param agent_id: The agent.
        :param seen_at: When its issues were last seen; None counts every call as new.
        :return: The groups, newest version first.
        """
        seen = seen_at.isoformat(timespec="milliseconds") if seen_at else ""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT i.agent_version, i.kind, i.node,"
                " count(DISTINCT i.call_id) AS call_count,"
                " count(DISTINCT CASE WHEN c.ended_at > :seen THEN i.call_id END) AS new_count,"
                " max(c.ended_at) AS last_at,"
                " (SELECT json_group_array(json_object('id', id, 'ended_at', ended_at)) FROM ("
                "    SELECT DISTINCT c2.id, c2.ended_at FROM call_issues AS i2 JOIN calls AS c2 ON c2.id = i2.call_id"
                "     WHERE i2.agent_id = i.agent_id AND i2.agent_version = i.agent_version"
                "       AND i2.kind = i.kind AND i2.node IS i.node"
                "     ORDER BY c2.ended_at DESC LIMIT :limit)) AS calls,"
                # The analyses' causes for exactly these issues: findings match an issue by call and step.
                " (SELECT json_group_array(cause) FROM ("
                "    SELECT json_extract(f.value, '$.cause') AS cause"
                "      FROM call_issues AS i3 JOIN calls AS c3 ON c3.id = i3.call_id"
                "      JOIN call_analyses AS a ON a.call_id = i3.call_id AND a.status = 'done',"
                "           json_each(a.findings) AS f"
                "     WHERE i3.agent_id = i.agent_id AND i3.agent_version = i.agent_version"
                "       AND i3.kind = i.kind AND i3.node IS i.node"
                "       AND json_extract(f.value, '$.step') = i3.step"
                "     GROUP BY i3.call_id, cause"
                "     ORDER BY max(c3.ended_at) DESC LIMIT :limit)) AS causes"
                " FROM call_issues AS i JOIN calls AS c ON c.id = i.call_id"
                " WHERE i.agent_id = :agent_id"
                " GROUP BY i.agent_version, i.kind, i.node"
                " ORDER BY i.agent_version DESC, last_at DESC",
                {"agent_id": agent_id, "seen": seen, "limit": CallRepository.GROUP_CALLS},
            ).fetchall()
        return [
            IssueGroup(
                version=r["agent_version"],
                kind=r["kind"],
                node=r["node"],
                call_count=r["call_count"],
                new_count=r["new_count"],
                last_at=datetime.fromisoformat(r["last_at"]),
                calls=json.loads(r["calls"]),
                causes=[cause for cause in json.loads(r["causes"]) if cause],
            )
            for r in rows
        ]

    def flags_for_agent(self, agent_id: str) -> list[FlagEntry]:
        """:param agent_id: The agent.
        :return: Customers' flags on its calls, newest first.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT c.agent_version, f.call_id, f.reason, f.created_at"
                " FROM call_flags AS f JOIN calls AS c ON c.id = f.call_id"
                " WHERE c.agent_id = ? ORDER BY f.id DESC",
                (agent_id,),
            ).fetchall()
        return [
            FlagEntry(r["agent_version"], r["call_id"], r["reason"], datetime.fromisoformat(r["created_at"]))
            for r in rows
        ]

    def issues_seen_at(self, agent_id: str) -> datetime | None:
        """:param agent_id: The agent.
        :return: When its issues were last seen; None if never.
        """
        with self._connect() as conn:
            row = conn.execute("SELECT seen_at FROM issues_seen WHERE agent_id = ?", (agent_id,)).fetchone()
        return datetime.fromisoformat(row["seen_at"]) if row else None

    def mark_issues_seen(self, agent_id: str, seen_at: datetime) -> None:
        """:param agent_id: The agent.
        :param seen_at: When its issues were seen; what happens after is new.
        """
        with self._transaction() as conn:
            conn.execute(
                "INSERT INTO issues_seen (agent_id, seen_at) VALUES (?, ?)"
                " ON CONFLICT (agent_id) DO UPDATE SET seen_at = excluded.seen_at",
                (agent_id, seen_at.isoformat(timespec="milliseconds")),
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

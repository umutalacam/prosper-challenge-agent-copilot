#
# CallRepository — stored voice calls (SQLite, the `calls` table in
# config/schema.sql, in the same database as the agents). A call is written once,
# when it ends, together with its issues (`call_issues`, for counting failures
# across calls); rows are never updated.
#

from __future__ import annotations

import json
import sqlite3
from collections.abc import Collection, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime
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
    """Something worth a look in a call, as CallAnalyzer judged it. ``stuck``: the bot improvised in the node the
    call ended in, unfinished (a failure); ``long_stay``: it improvised in a node but
    the call moved on (a note); ``error``: the pipeline raised."""

    kind: IssueKind
    node: str | None  # where it happened; None for an error before the flow started
    step: int | None  # its index in CallAnalyzer.steps; None if the flow never started
    at_ms: int
    replies: int | None = None  # stuck / long_stay: the bot reply that tipped it
    message: str | None = None  # error: what the pipeline raised


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
        """Store a finished call, with its issues.

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
                "    FROM (SELECT * FROM call_issues WHERE call_id = calls.id ORDER BY rowid)) AS issues"
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
            )
            for r in rows
        ]

    def get(self, call_id: str) -> CallRecord:
        """One stored call in full.

        :param call_id: The call's id.
        :return: The call, with its timeline and final state.
        :raises CallNotFound: If there's no such call.
        """
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM calls WHERE id = ?", (call_id,)).fetchone()
        if row is None:
            raise CallNotFound(call_id)
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

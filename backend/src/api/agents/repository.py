#
# AgentRepository — the one object that reads and writes agents (SQLite).
# Tables are defined in config/schema.sql; config/seed.sql holds the sample agent.
#
# Every write bumps `version`. Pass the version you loaded as `expected_version`
# and the write fails with VersionConflict if someone saved in between.
#

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from config import SCHEMA_SQL

@dataclass(frozen=True)
class AgentRecord:
    id: str
    body: dict[str, Any]
    version: int
    updated_at: datetime


@dataclass(frozen=True)
class AgentVersion:
    """A reference to one saved version of an agent (e.g. the one a call ran)."""

    agent_id: str
    version: int


@dataclass(frozen=True)
class AgentSummary:
    id: str
    name: str
    node_count: int
    version: int
    updated_at: datetime


class AgentNotFound(Exception):
    def __init__(self, agent_id: str) -> None:
        """:param agent_id: The id that matched no agent."""
        super().__init__(f"Agent '{agent_id}' not found.")


class AgentExists(Exception):
    def __init__(self, agent_id: str) -> None:
        """:param agent_id: The id that's already taken."""
        super().__init__(f"Agent '{agent_id}' already exists.")


class VersionConflict(Exception):
    def __init__(self, agent_id: str, expected: int, actual: int) -> None:
        """:param agent_id: The agent that was saved elsewhere.
        :param expected: The version the writer loaded.
        :param actual: The version stored now.
        """
        super().__init__(f"Agent '{agent_id}' is at version {actual}, not {expected}.")
        self.actual = actual


def _now() -> str:
    """The current time, for the timestamp columns.

    :return: UTC, ISO 8601, to the millisecond.
    """
    return datetime.now(UTC).isoformat(timespec="milliseconds")


class AgentRepository:
    """Opens a short-lived connection per call, so one instance can be shared across
    FastAPI's worker threads. Writes take the lock up front (BEGIN IMMEDIATE), so a
    version check and the write that follows it can't interleave with another save."""

    def __init__(self, path: str | Path, *, seed: Path | None = None) -> None:
        """Open (creating if needed) the database and apply schema.sql.

        :param path: The SQLite file.
        :param seed: A SQL file run once if the database has no agents yet.
        """
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL.read_text())
        if seed is not None and self.count() == 0:
            with self._connect() as conn:
                conn.executescript(f"BEGIN;\n{seed.read_text()}\nCOMMIT;")

    # ---- reads -------------------------------------------------------------
    def list(self) -> list[AgentSummary]:
        """All agents, ordered by name.

        :return: Their summaries, without bodies.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, node_count, version, updated_at FROM agents "
                "ORDER BY name COLLATE NOCASE, id"
            ).fetchall()
        return [
            AgentSummary(
                id=r["id"],
                name=r["name"] or r["id"],
                node_count=r["node_count"] or 0,
                version=r["version"],
                updated_at=datetime.fromisoformat(r["updated_at"]),
            )
            for r in rows
        ]

    def get(self, agent_id: str) -> AgentRecord:
        """One agent with its body.

        :param agent_id: The agent's id.
        :return: The agent at its current version.
        :raises AgentNotFound: If there's no such agent.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, body, version, updated_at FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()
        if row is None:
            raise AgentNotFound(agent_id)
        return AgentRecord(
            row["id"], json.loads(row["body"]), row["version"], datetime.fromisoformat(row["updated_at"])
        )

    def get_version(self, agent_id: str, version: int) -> AgentRecord:
        """One saved version of an agent, from its history.

        :param agent_id: The agent's id.
        :param version: The version to read.
        :return: The agent as it was saved at that version.
        :raises AgentNotFound: If there's no such agent or version.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT agent_id, body, version, created_at FROM agent_versions"
                " WHERE agent_id = ? AND version = ?",
                (agent_id, version),
            ).fetchone()
        if row is None:
            raise AgentNotFound(agent_id)
        return AgentRecord(
            row["agent_id"], json.loads(row["body"]), row["version"], datetime.fromisoformat(row["created_at"])
        )

    def count(self) -> int:
        """:return: How many agents are stored."""
        with self._connect() as conn:
            return conn.execute("SELECT count(*) FROM agents").fetchone()[0]

    # ---- writes ------------------------------------------------------------
    def create(self, agent_id: str, body: dict[str, Any]) -> AgentRecord:
        """Store a new agent under exactly ``agent_id``, at version 1.

        :param agent_id: The id to use.
        :param body: The agent document.
        :return: The stored agent.
        :raises AgentExists: If the id is taken.
        """
        with self._transaction() as conn:
            if self._version_of(conn, agent_id) is not None:
                raise AgentExists(agent_id)
            return self._insert(conn, agent_id, body)

    def create_unique(self, id_base: str, body: dict[str, Any]) -> AgentRecord:
        """Store a new agent under ``id_base``, or ``id_base-2``, ``-3``… if taken.

        :param id_base: The preferred id.
        :param body: The agent document.
        :return: The stored agent, with the id it got.
        """
        with self._transaction() as conn:
            agent_id, n = id_base, 2
            while self._version_of(conn, agent_id) is not None:
                agent_id, n = f"{id_base}-{n}", n + 1
            return self._insert(conn, agent_id, body)

    def update(
        self, agent_id: str, body: dict[str, Any], *, expected_version: int | None = None
    ) -> AgentRecord:
        """Replace the body and bump the version; the old body stays in agent_versions.

        :param agent_id: The agent to update.
        :param body: The new agent document.
        :param expected_version: The version the caller loaded; None skips the check.
        :return: The agent at its new version.
        :raises AgentNotFound: If there's no such agent.
        :raises VersionConflict: If it was saved elsewhere since ``expected_version``.
        """
        with self._transaction() as conn:
            current = self._check_version(conn, agent_id, expected_version)
            version, now, text = current + 1, _now(), json.dumps(body)
            conn.execute(
                "UPDATE agents SET body = ?, version = ?, updated_at = ? WHERE id = ?",
                (text, version, now, agent_id),
            )
            self._record_version(conn, agent_id, version, text, now)
        return AgentRecord(agent_id, body, version, datetime.fromisoformat(now))

    def delete(self, agent_id: str, *, expected_version: int | None = None) -> None:
        """Remove the agent with its history and its stored calls.

        :param agent_id: The agent to delete.
        :param expected_version: The version the caller loaded; None skips the check.
        :raises AgentNotFound: If there's no such agent.
        :raises VersionConflict: If it was saved elsewhere since ``expected_version``.
        """
        with self._transaction() as conn:
            self._check_version(conn, agent_id, expected_version)
            conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))

    # ---- internals ---------------------------------------------------------
    def _open(self) -> sqlite3.Connection:
        """A new connection: no implicit transactions (``_transaction`` manages them),
        rows by column name, foreign keys on.

        :return: The open connection.
        """
        # isolation_level=None: no implicit transactions; _transaction() manages them.
        conn = sqlite3.connect(self.path, timeout=5.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """A connection for one operation, closed afterwards.

        :return: The open connection, while the ``with`` block runs.
        """
        conn = self._open()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        """A connection inside a write transaction, taken up front (``BEGIN IMMEDIATE``)
        so a version check and the write after it can't interleave with another save.
        Commits when the block ends, rolls back if it raises.

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

    @staticmethod
    def _version_of(conn: sqlite3.Connection, agent_id: str) -> int | None:
        """:param conn: An open connection.
        :param agent_id: The agent's id.
        :return: Its current version, or None if there's no such agent.
        """
        row = conn.execute("SELECT version FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return None if row is None else row["version"]

    def _check_version(
        self, conn: sqlite3.Connection, agent_id: str, expected: int | None
    ) -> int:
        """Check that the agent exists and is still at the version the caller loaded.

        :param conn: A connection inside the write transaction.
        :param agent_id: The agent's id.
        :param expected: The version the caller loaded; None skips the comparison.
        :return: The current version.
        :raises AgentNotFound: If there's no such agent.
        :raises VersionConflict: If it's at another version.
        """
        current = self._version_of(conn, agent_id)
        if current is None:
            raise AgentNotFound(agent_id)
        if expected is not None and expected != current:
            raise VersionConflict(agent_id, expected, current)
        return current

    def _insert(self, conn: sqlite3.Connection, agent_id: str, body: dict[str, Any]) -> AgentRecord:
        """Insert a new agent at version 1, with its first history row.

        :param conn: A connection inside the write transaction.
        :param agent_id: The id to use (known to be free).
        :param body: The agent document.
        :return: The stored agent.
        """
        now, text = _now(), json.dumps(body)
        conn.execute(
            "INSERT INTO agents (id, body, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
            (agent_id, text, now, now),
        )
        self._record_version(conn, agent_id, 1, text, now)
        return AgentRecord(agent_id, body, 1, datetime.fromisoformat(now))

    @staticmethod
    def _record_version(
        conn: sqlite3.Connection, agent_id: str, version: int, body: str, created_at: str
    ) -> None:
        """Append a body to agent_versions.

        :param conn: A connection inside the write transaction.
        :param agent_id: The agent's id.
        :param version: The version the body was saved as.
        :param body: The agent document, as JSON text.
        :param created_at: When it was saved.
        """
        conn.execute(
            "INSERT INTO agent_versions (agent_id, version, body, created_at) VALUES (?, ?, ?, ?)",
            (agent_id, version, body, created_at),
        )

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
class AgentSummary:
    id: str
    name: str
    node_count: int
    version: int
    updated_at: datetime


class AgentNotFound(Exception):
    def __init__(self, agent_id: str) -> None:
        super().__init__(f"Agent '{agent_id}' not found.")


class AgentExists(Exception):
    def __init__(self, agent_id: str) -> None:
        super().__init__(f"Agent '{agent_id}' already exists.")


class VersionConflict(Exception):
    def __init__(self, agent_id: str, expected: int, actual: int) -> None:
        super().__init__(f"Agent '{agent_id}' is at version {actual}, not {expected}.")
        self.actual = actual


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds")


class AgentRepository:
    """Opens a short-lived connection per call, so one instance can be shared across
    FastAPI's worker threads. Writes take the lock up front (BEGIN IMMEDIATE), so a
    version check and the write that follows it can't interleave with another save."""

    def __init__(self, path: str | Path, *, seed: Path | None = None) -> None:
        """Opens (creating if needed) the database at `path` and applies schema.sql.
        With `seed`, that SQL file is run once if the database has no agents yet."""
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL.read_text())
        if seed is not None and self.count() == 0:
            with self._connect() as conn:
                conn.executescript(f"BEGIN;\n{seed.read_text()}\nCOMMIT;")

    # ---- reads -------------------------------------------------------------
    def list(self) -> list[AgentSummary]:
        """All agents, ordered by name."""
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
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, body, version, updated_at FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()
        if row is None:
            raise AgentNotFound(agent_id)
        return AgentRecord(
            row["id"], json.loads(row["body"]), row["version"], datetime.fromisoformat(row["updated_at"])
        )

    def count(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT count(*) FROM agents").fetchone()[0]

    # ---- writes ------------------------------------------------------------
    def create(self, agent_id: str, body: dict[str, Any]) -> AgentRecord:
        """Store a new agent under exactly `agent_id`. Raises AgentExists."""
        with self._transaction() as conn:
            if self._version_of(conn, agent_id) is not None:
                raise AgentExists(agent_id)
            return self._insert(conn, agent_id, body)

    def create_unique(self, id_base: str, body: dict[str, Any]) -> AgentRecord:
        """Store a new agent under `id_base`, or `id_base-2`, `-3`… if taken."""
        with self._transaction() as conn:
            agent_id, n = id_base, 2
            while self._version_of(conn, agent_id) is not None:
                agent_id, n = f"{id_base}-{n}", n + 1
            return self._insert(conn, agent_id, body)

    def update(
        self, agent_id: str, body: dict[str, Any], *, expected_version: int | None = None
    ) -> AgentRecord:
        """Replace the body and bump the version."""
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
        """Remove the agent and its history."""
        with self._transaction() as conn:
            self._check_version(conn, agent_id, expected_version)
            conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))

    # ---- internals ---------------------------------------------------------
    def _open(self) -> sqlite3.Connection:
        # isolation_level=None: no implicit transactions; _transaction() manages them.
        conn = sqlite3.connect(self.path, timeout=5.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = self._open()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
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
        row = conn.execute("SELECT version FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return None if row is None else row["version"]

    def _check_version(
        self, conn: sqlite3.Connection, agent_id: str, expected: int | None
    ) -> int:
        current = self._version_of(conn, agent_id)
        if current is None:
            raise AgentNotFound(agent_id)
        if expected is not None and expected != current:
            raise VersionConflict(agent_id, expected, current)
        return current

    def _insert(self, conn: sqlite3.Connection, agent_id: str, body: dict[str, Any]) -> AgentRecord:
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
        conn.execute(
            "INSERT INTO agent_versions (agent_id, version, body, created_at) VALUES (?, ?, ?, ?)",
            (agent_id, version, body, created_at),
        )

#
# DeploymentRepository — which saved agent version the voice bot answers calls
# with (the `deployments` table in config/schema.sql). Every deploy is a new row;
# the newest is live, so a restart picks up where it left off. Deleting an agent
# drops its deployments, so deleting the live agent rolls back to the one deployed
# before it (if any).
#

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from api.agents.repository import AgentVersion
from config import SCHEMA_SQL


@dataclass(frozen=True)
class Deployment:
    """A deploy: from ``deployed_at`` on, calls run this agent version."""

    agent: AgentVersion
    deployed_at: datetime


class DeploymentRepository:
    """A short-lived connection per operation, like the other repositories."""

    def __init__(self, path: str | Path) -> None:
        """Open (creating if needed) the database and apply schema.sql.

        :param path: The SQLite file; the agents' database.
        """
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL.read_text())

    def record(self, agent: AgentVersion) -> Deployment:
        """Store a deploy; it's live from now on.

        :param agent: The saved agent version to answer calls with.
        :return: The deployment.
        """
        # Stored to the millisecond; returned the same, so it equals what current() reads.
        stamp = datetime.now(UTC).isoformat(timespec="milliseconds")
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO deployments (agent_id, version, deployed_at) VALUES (?, ?, ?)",
                (agent.agent_id, agent.version, stamp),
            )
        return Deployment(agent, datetime.fromisoformat(stamp))

    def current(self) -> Deployment | None:
        """The live deployment: the newest one still stored.

        :return: It, or None if nothing is deployed.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT agent_id, version, deployed_at FROM deployments ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        return Deployment(
            AgentVersion(row["agent_id"], row["version"]), datetime.fromisoformat(row["deployed_at"])
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

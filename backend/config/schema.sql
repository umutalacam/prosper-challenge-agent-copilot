-- Agent database schema (SQLite). Applied on every start; must stay idempotent.

PRAGMA journal_mode = WAL;

-- One row per agent: the whole agent document plus bookkeeping.
-- `name` and `node_count` are derived from the JSON for cheap listing.
CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    body        TEXT NOT NULL CHECK (json_valid(body)),
    version     INTEGER NOT NULL CHECK (version >= 1),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    name        TEXT GENERATED ALWAYS AS (json_extract(body, '$.name')) VIRTUAL,
    node_count  INTEGER GENERATED ALWAYS AS (json_array_length(body, '$.nodes')) VIRTUAL
) STRICT;

-- Append-only copy of every saved body (history, for later rollback).
CREATE TABLE IF NOT EXISTS agent_versions (
    agent_id    TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    body        TEXT NOT NULL CHECK (json_valid(body)),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (agent_id, version)
) STRICT;

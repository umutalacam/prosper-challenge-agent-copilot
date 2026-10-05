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

-- One row per finished voice call, written once when the call ends (api/calls).
-- `events` is the call's timeline: started, each caller / bot turn, each
-- transition with the state after it (the state history), stuck warnings, ended.
-- `agent_id` is NULL for calls that ran the AGENT_FLOW file instead of a saved agent.
CREATE TABLE IF NOT EXISTS calls (
    id             TEXT PRIMARY KEY,
    agent_id       TEXT REFERENCES agents (id) ON DELETE CASCADE,
    agent_version  INTEGER,
    agent_name     TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    ended_at       TEXT NOT NULL,
    outcome        TEXT NOT NULL CHECK (outcome IN ('completed', 'abandoned', 'not_started', 'error')),
    end_node       TEXT,
    path           TEXT NOT NULL CHECK (json_valid(path)),
    final_state    TEXT NOT NULL CHECK (json_valid(final_state)),
    events         TEXT NOT NULL CHECK (json_valid(events))
) STRICT;

CREATE INDEX IF NOT EXISTS calls_by_agent ON calls (agent_id, started_at DESC);

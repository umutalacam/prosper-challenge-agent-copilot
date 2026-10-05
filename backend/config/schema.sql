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

-- Every deploy, append-only (api/bot): which saved version of an agent answers
-- calls from then on. The newest row is what's live. Deploying pins the version,
-- so saving edits changes nothing for callers until the agent is deployed again.
-- Deleting an agent drops its deployments (via agent_versions): deleting the
-- live agent rolls back to the one deployed before it, if any.
CREATE TABLE IF NOT EXISTS deployments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id     TEXT NOT NULL,
    version      INTEGER NOT NULL,
    deployed_at  TEXT NOT NULL,
    FOREIGN KEY (agent_id, version) REFERENCES agent_versions (agent_id, version) ON DELETE CASCADE
) STRICT;

-- One row per finished voice call, written once when the call ends (api/calls).
-- `events` is the call's timeline: started, each caller / bot turn, each
-- transition with the state after it (the state history), stuck warnings, ended.
CREATE TABLE IF NOT EXISTS calls (
    id             TEXT PRIMARY KEY,
    agent_id       TEXT NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    agent_version  INTEGER NOT NULL,
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

-- What went wrong in each call (CallRecord.issues), written with the call, so
-- failures can be counted across calls: where an agent (or one version of it)
-- gets stuck, which nodes need many replies, how often calls error. `agent_id` /
-- `agent_version` are copied from the call so those queries don't need a join.
--   stuck      the bot improvised in the node the call ended in, unfinished (a failure)
--   long_stay  it improvised in a node but the call moved on (a note)
--   error      the pipeline raised (`message`)
CREATE TABLE IF NOT EXISTS call_issues (
    call_id        TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    agent_id       TEXT NOT NULL,
    agent_version  INTEGER NOT NULL,
    kind           TEXT NOT NULL CHECK (kind IN ('stuck', 'long_stay', 'error')),
    node           TEXT,
    step           INTEGER,
    at_ms          INTEGER NOT NULL,
    replies        INTEGER,
    message        TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS call_issues_by_call ON call_issues (call_id);
CREATE INDEX IF NOT EXISTS call_issues_by_agent ON call_issues (agent_id, agent_version, kind, node);

-- The AI analysis of a call with issues (api/calls/copilot_analyzer.py): why it went wrong
-- and what to change in the agent. Written `pending` with the call, then set once
-- to `done` (summary + findings) or `failed` (error) when the model answers.
-- `findings` is a JSON array of {node, step, cause, suggestion}.
CREATE TABLE IF NOT EXISTS call_analyses (
    call_id     TEXT PRIMARY KEY REFERENCES calls (id) ON DELETE CASCADE,
    status      TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
    summary     TEXT,
    findings    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(findings)),
    error       TEXT,
    model       TEXT,
    updated_at  TEXT NOT NULL
) STRICT;

-- Customers' reports that a call went wrong ("it booked the wrong day"), any number
-- per call. A new flag restarts the call's AI analysis, with the reason as evidence.
CREATE TABLE IF NOT EXISTS call_flags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id     TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS call_flags_by_call ON call_flags (call_id);

#
# Paths and settings shared by the API and the voice bot.
#

import os
from pathlib import Path

# backend/ — this file is backend/src/config.py.
BACKEND_DIR = Path(__file__).resolve().parents[1]

# Database configuration files, kept outside the source tree.
CONFIG_DIR = BACKEND_DIR / "config"
SCHEMA_SQL = CONFIG_DIR / "schema.sql"  # DDL, applied on every start (idempotent)
SEED_SQL = CONFIG_DIR / "seed.sql"  # sample data, loaded only into an empty database
COPILOT_DIR = CONFIG_DIR / "copilot"  # the copilot's prompts, tools and schemas, read every turn
CALLS_DIR = CONFIG_DIR / "calls"  # the call analysis prompt and answer schema, read on every analysis

# The OpenAI model behind the agent copilot.
COPILOT_MODEL = os.getenv("COPILOT_MODEL", "gpt-4o")

# The OpenAI model that analyzes calls with issues; the copilot's unless set.
CALL_ANALYSIS_MODEL = os.getenv("CALL_ANALYSIS_MODEL", COPILOT_MODEL)

# Where the agent database lives. Override with AGENTS_DB (relative to backend/).
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "agents.db"


def agents_db_path() -> Path:
    configured = os.getenv("AGENTS_DB")
    return BACKEND_DIR / configured if configured else DEFAULT_DB_PATH

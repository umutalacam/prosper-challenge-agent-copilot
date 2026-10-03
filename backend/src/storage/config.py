import os
from pathlib import Path

# backend/ — this file is backend/src/storage/config.py.
BACKEND_DIR = Path(__file__).resolve().parents[2]

# Database configuration files, kept outside the source tree.
CONFIG_DIR = BACKEND_DIR / "config"
SCHEMA_SQL = CONFIG_DIR / "schema.sql"  # DDL, applied on every start (idempotent)
SEED_SQL = CONFIG_DIR / "seed.sql"  # sample data, loaded only into an empty database

# Where the agent database lives. Override with AGENTS_DB (relative to backend/).
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "agents.db"


def agents_db_path() -> Path:
    configured = os.getenv("AGENTS_DB")
    return BACKEND_DIR / configured if configured else DEFAULT_DB_PATH

#
# Agent API — CRUD over agent JSON files, for the Composer UI (frontend/).
#
# Agents live as backend/agents/<id>.json, in the same format as example_flow.json.
# Every save is validated by AgentBuilder, i.e. the exact code bot.py runs, so the
# UI can never persist an agent the bot can't load.
#
# Run:  uvicorn api:app --reload --port 8000   (or `make api` from the repo root)
#

import json
import re
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response

from agent_builder import AgentBuilder

BACKEND_DIR = Path(__file__).parent
AGENTS_DIR = BACKEND_DIR / "agents"
EXAMPLE_FLOW = BACKEND_DIR / "example_flow.json"


# ---- helpers ---------------------------------------------------------------
def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


def _path(agent_id: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", agent_id):
        raise HTTPException(404, f"Agent '{agent_id}' not found.")
    path = AGENTS_DIR / f"{agent_id}.json"
    if not path.exists():
        raise HTTPException(404, f"Agent '{agent_id}' not found.")
    return path


def _validate(data: dict) -> None:
    try:
        AgentBuilder.from_dict(data)
    except KeyError as e:
        raise HTTPException(422, f"Missing required field {e}.")
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


def _write(path: Path, data: dict) -> dict:
    _validate(data)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return {"id": path.stem, **data}


# Seed with the example agent so the UI never starts empty.
AGENTS_DIR.mkdir(exist_ok=True)
if not any(AGENTS_DIR.glob("*.json")):
    shutil.copy(EXAMPLE_FLOW, AGENTS_DIR / f"{_slugify(_read(EXAMPLE_FLOW)['name'])}.json")

app = FastAPI(title="Prosper Agent API")


# ---- routes ----------------------------------------------------------------
@app.get("/api/agents")
def list_agents() -> list[dict]:
    agents = []
    for path in sorted(AGENTS_DIR.glob("*.json")):
        data = _read(path)
        agents.append(
            {"id": path.stem, "name": data.get("name", path.stem), "node_count": len(data.get("nodes", []))}
        )
    return agents


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> dict:
    return {"id": agent_id, **_read(_path(agent_id))}


@app.post("/api/agents", status_code=201)
def create_agent(data: dict) -> dict:
    data.pop("id", None)
    base = _slugify(data.get("name", ""))
    agent_id, n = base, 2
    while (AGENTS_DIR / f"{agent_id}.json").exists():
        agent_id, n = f"{base}-{n}", n + 1
    return _write(AGENTS_DIR / f"{agent_id}.json", data)


@app.put("/api/agents/{agent_id}")
def update_agent(agent_id: str, data: dict) -> dict:
    data.pop("id", None)
    return _write(_path(agent_id), data)


@app.delete("/api/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str) -> Response:
    _path(agent_id).unlink()
    return Response(status_code=204)

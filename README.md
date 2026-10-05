# Prosper Challenge — Agent Composer

Voice AI for healthcare scheduling. An agent is a **graph of nodes** (Pipecat Flows), defined declaratively as JSON and compiled into a runnable voice pipeline.

- **Phase 1** — a UI to edit the node graph and place a test call.
- **Phase 2** — an AI Composer that generates and iterates on agents from natural language.

```
browser mic  ->  ElevenLabs STT  ->  OpenAI LLM  ->  ElevenLabs TTS  ->  browser
```

Pipecat's dev runner ships a **prebuilt browser client**, so the test-call UI comes for free — no frontend code to write yet.

## Quickstart

Requires **Python 3.11+** and [**uv**](https://docs.astral.sh/uv/getting-started/installation/) (uv will fetch a matching Python for you if needed). Run from the repo root:

```bash
make install   # uv sync — creates backend/.venv and installs from uv.lock
make api       # agent API + voice bot (uvicorn main:app)
```

Open `http://localhost:7860/client`, click **Connect**, allow mic access, and talk to the agent. `Ctrl+C` to stop. (`make help` lists all targets.)

Prefer raw `uv`? The same commands without `make`:

```bash
uv sync --directory backend            # install dependencies
uv run --directory backend uvicorn main:app --app-dir src --port 7860   # run the agent
```\
\
Remember to update the `.env` file accordingly.

## Agent Composer UI

A React + React Flow editor for building agents as node graphs. Requires Node.js 18+. Bring up everything with one command:

```bash
make dev   # agent API + voice bot (:7860, talk at /client) + UI (http://localhost:5173); Ctrl+C stops all
```

Or run the pieces separately: `make api`, `make web`.

Create an agent, write its personality (system prompt), add nodes, and drag between nodes to create **actions** (functions the LLM calls to move on, with fields to collect). Every save is validated by `AgentBuilder`. To call an agent, deploy it (the **Deploy** button on the agent list, or the API) and open `http://localhost:7860/client`:

```bash
curl -X PUT localhost:7860/api/bot -H 'content-type: application/json' -d '{"agent_id":"<id>"}'
```

Deploying pins the agent's current saved version: later saves don't reach callers until you deploy again. Deployments are stored, so a restart keeps the live agent; the next call gets a new deployment and calls in progress keep theirs. With nothing deployed, calls are refused.

## Layout

| Path | Responsibility |
| --- | --- |
| `backend/src/api/bot/` | The voice bot, served by the API process. `pipeline.py` = the voice pipeline (WebRTC + ElevenLabs STT/TTS + OpenAI LLM), with no graph logic; `service.py` deploys agents and picks each call's agent version; `routes.py` = `/api/bot` + WebRTC signaling. |
| `backend/src/agent_builder/` | All agent-building code. `schema.py` = the declarative `AgentConfig` / `Node` / `Edge` contract; `builder.py` = `AgentBuilder`, which loads + validates the JSON and compiles it into a Pipecat Flows graph. |
| `backend/src/main.py` | Backend entry point (FastAPI): the agent API and the voice bot. Agents live in SQLite; `api/agents/` holds routes → service → repository. Every save is validated with `AgentBuilder`. |
| `frontend/` | Agent Composer UI (Vite + React + `@xyflow/react`, SCSS modules). Pages in `src/pages/`, shared API/types/UI kit in `src/shared/`. `make web-check` runs typecheck, lint, format check and tests. |
| `backend/example_flow.json` | The example agent **as data** — a clinic scheduler. The artifact the Phase 2 Composer generates/edits. |
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
make run       # uv run python src/bot.py
```

Open the URL it prints (default `http://localhost:7860/client`), click **Connect**, allow mic access, and talk to the agent. `Ctrl+C` to stop. (`make help` lists all targets.)

Prefer raw `uv`? The same commands without `make`:

```bash
uv sync --directory backend            # install dependencies
uv run --directory backend python src/bot.py   # run the agent
```\
\
Remember to update the `.env` file accordingly.

## Agent Composer UI

A React + React Flow editor for building agents as node graphs. Requires Node.js 18+. Bring up everything with one command:

```bash
make dev   # agent API (:8000) + UI (http://localhost:5173) + voice bot (:7860); Ctrl+C stops all
```

Or run the pieces separately: `make api`, `make web`, `make run`.

Create an agent, write its personality (system prompt), add nodes, and drag between nodes to create **actions** (functions the LLM calls to move on, with fields to collect). Every save is validated by `AgentBuilder`. To call a saved agent: `AGENT_FLOW=agents/<id>.json make run`.

## Layout

| Path | Responsibility |
| --- | --- |
| `backend/src/bot.py` | The voice pipeline (WebRTC + ElevenLabs STT/TTS + OpenAI LLM). Loads an agent JSON via `AgentBuilder` and runs it. No graph logic lives here. |
| `backend/src/agent_builder/` | All agent-building code. `schema.py` = the declarative `AgentConfig` / `Node` / `Edge` contract; `builder.py` = `AgentBuilder`, which loads + validates the JSON and compiles it into a Pipecat Flows graph. |
| `backend/src/api.py` | FastAPI CRUD over `backend/agents/*.json` for the UI; validates every save with `AgentBuilder`. |
| `frontend/` | Agent Composer UI (Vite + React + `@xyflow/react`, SCSS modules). Pages in `src/pages/`, shared API/types/UI kit in `src/shared/`. `make web-check` runs typecheck, lint, format check and tests. |
| `backend/example_flow.json` | The example agent **as data** — a clinic scheduler. The artifact the Phase 2 Composer generates/edits. |

To run a different agent, set `AGENT_FLOW` (path relative to `backend/`), e.g. `AGENT_FLOW=agents/my-agent.json make run`.
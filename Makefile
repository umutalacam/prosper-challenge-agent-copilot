# Prosper Challenge — run everything from the repo root.
# Dependencies are managed with uv (https://docs.astral.sh/uv/).

PROJECT := backend
FRONTEND := frontend
# API + voice bot. 7860 is where the voice client has always lived (:7860/client).
PORT := 7860

.PHONY: help install dev api api-test web-install web web-check clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (npm) dependencies
	uv sync --directory $(PROJECT)
	npm install --prefix $(FRONTEND)

dev: $(FRONTEND)/node_modules ## Run API + voice bot + UI together (Ctrl+C stops all)
	@echo "UI    -> http://localhost:5173"
	@echo "Voice -> http://localhost:$(PORT)/client  (switch agents: PUT /api/bot {\"agent_id\": ...})"
	@$(MAKE) --no-print-directory -j2 api web

api: ## Run the agent API + voice bot on :7860 (deploy an agent, then talk at /client)
	uv run --directory $(PROJECT) uvicorn main:app --app-dir src --reload --reload-dir src --port $(PORT)

api-test: ## Run the backend tests (pytest)
	uv run --directory $(PROJECT) pytest

web-install: ## Install frontend dependencies (npm)
	npm install --prefix $(FRONTEND)

# Installs frontend deps on first `make dev` / `make web`, and again when package.json changes.
$(FRONTEND)/node_modules: $(FRONTEND)/package.json
	npm install --prefix $(FRONTEND)
	@touch $@

web: $(FRONTEND)/node_modules ## Run the Agent Composer UI (then open http://localhost:5173)
	npm run dev --prefix $(FRONTEND)

web-check: $(FRONTEND)/node_modules ## Frontend quality gate: typecheck, lint, format check, tests
	npm run check --prefix $(FRONTEND)

clean: ## Remove the venv, node_modules and Python caches
	rm -rf $(PROJECT)/.venv $(FRONTEND)/node_modules
	find $(PROJECT) -type d -name __pycache__ -prune -exec rm -rf {} +

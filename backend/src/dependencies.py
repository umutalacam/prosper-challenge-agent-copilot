#
# Dependency providers. Each is cached with @lru_cache, so the app shares one
# instance per process (a singleton "bean"): one repository, one service, one bot.
#
# Routes ask for them with Depends(...); tests replace one with
#   app.dependency_overrides[get_agent_repository] = lambda: test_repository
#
# (No `from __future__ import annotations` here: FastAPI reads these signatures
# through the lru_cache wrapper, which needs real annotation objects.)
#

from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from openai import AsyncOpenAI

from api.agents.repository import AgentRepository
from api.agents.service import AgentService
from api.bot.service import BotService
from api.copilot.service import CopilotService
from config import COPILOT_DIR, COPILOT_MODEL, SEED_SQL, agents_db_path


@lru_cache
def get_agent_repository() -> AgentRepository:
    """The agent database. Created on first use; an empty one gets the sample agent."""
    return AgentRepository(agents_db_path(), seed=SEED_SQL)


@lru_cache
def get_agent_service(
    repository: Annotated[AgentRepository, Depends(get_agent_repository)],
) -> AgentService:
    # Cached per repository instance, so an overridden repository gets its own service.
    return AgentService(repository)


@lru_cache
def get_bot_service(
    agents: Annotated[AgentService, Depends(get_agent_service)],
) -> BotService:
    # One per process: it owns the WebRTC connections and the running calls.
    return BotService(agents)


@lru_cache
def get_copilot_service() -> CopilotService:
    # AsyncOpenAI reads OPENAI_API_KEY from the environment (backend/.env, loaded in main.py).
    return CopilotService(AsyncOpenAI(), COPILOT_MODEL, COPILOT_DIR)

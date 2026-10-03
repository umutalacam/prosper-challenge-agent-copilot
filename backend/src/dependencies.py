#
# Dependency providers. Each is cached with @lru_cache, so the app shares one
# instance per process (a singleton "bean"): one repository, one service.
#
# Routes ask for them with Depends(...); tests replace one with
#   app.dependency_overrides[get_agent_repository] = lambda: test_repository
# Outside a request (the voice bot), call them directly: get_agent_repository().
#
# (No `from __future__ import annotations` here: FastAPI reads these signatures
# through the lru_cache wrapper, which needs real annotation objects.)
#

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from api.agents.repository import AgentRepository
from api.agents.service import AgentService
from config import SEED_SQL, agents_db_path


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

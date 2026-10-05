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
from api.bot.repository import DeploymentRepository
from api.bot.service import BotService
from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallRepository
from api.calls.service import CallRecordService
from api.copilot.service import CopilotService
from config import COPILOT_DIR, COPILOT_MODEL, SEED_SQL, agents_db_path


@lru_cache
def get_agent_repository() -> AgentRepository:
    """The agent database. Created on first use; an empty one gets the sample agent.

    :return: The process's one repository.
    """
    return AgentRepository(agents_db_path(), seed=SEED_SQL)


@lru_cache
def get_agent_service(
    repository: Annotated[AgentRepository, Depends(get_agent_repository)],
) -> AgentService:
    """Agent rules over a repository. Cached per repository instance, so an
    overridden repository gets its own service.

    :param repository: The agent database.
    :return: The service for that repository.
    """
    return AgentService(repository)


@lru_cache
def get_call_repository() -> CallRepository:
    """Stored calls, in the same database file as the agents.

    :return: The process's one call repository.
    """
    return CallRepository(agents_db_path())


@lru_cache
def get_call_analyzer() -> CallAnalyzer:
    """:return: The process's one call analyzer."""
    return CallAnalyzer()


@lru_cache
def get_call_record_service(
    repository: Annotated[CallRepository, Depends(get_call_repository)],
    agents: Annotated[AgentService, Depends(get_agent_service)],
    analyzer: Annotated[CallAnalyzer, Depends(get_call_analyzer)],
) -> CallRecordService:
    """Stored calls: saved by the voice bot, read by the calls routes.

    :param repository: Where calls are stored.
    :param agents: Used to check that a call's agent exists.
    :param analyzer: Judges each call: its steps and issues.
    :return: The service for those dependencies.
    """
    return CallRecordService(repository, agents, analyzer)


@lru_cache
def get_deployment_repository() -> DeploymentRepository:
    """Which agent version is live, in the same database file as the agents.

    :return: The process's one deployment repository.
    """
    return DeploymentRepository(agents_db_path())


@lru_cache
def get_bot_service(
    agents: Annotated[AgentService, Depends(get_agent_service)],
    call_records: Annotated[CallRecordService, Depends(get_call_record_service)],
    deployments: Annotated[DeploymentRepository, Depends(get_deployment_repository)],
) -> BotService:
    """The voice bot. One per process: it owns the WebRTC connections and the running calls.

    :param agents: Where calls' agents are loaded from.
    :param call_records: Where finished calls are stored.
    :param deployments: Which agent version is live.
    :return: The bot.
    """
    return BotService(agents, call_records, deployments)


@lru_cache
def get_copilot_service() -> CopilotService:
    """The agent copilot. AsyncOpenAI reads OPENAI_API_KEY from the environment
    (backend/.env, loaded in main.py).

    :return: The process's one copilot.
    """
    return CopilotService(AsyncOpenAI(), COPILOT_MODEL, COPILOT_DIR)

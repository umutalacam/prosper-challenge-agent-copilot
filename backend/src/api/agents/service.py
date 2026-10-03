#
# AgentService — the rules for managing agents, between the controller (HTTP) and
# the repository (SQLite). It knows nothing about requests, headers or status codes.
#

import re
from typing import Any

from agent_builder import AgentBuilder
from helpers import slugify

from .repository import AgentNotFound, AgentRecord, AgentRepository, AgentSummary

AGENT_ID_PATTERN = re.compile(r"^[a-z0-9-]+$")


class InvalidAgent(Exception):
    """The agent can't be loaded by AgentBuilder, so the voice bot couldn't run it."""


class AgentService:
    def __init__(self, repository: AgentRepository) -> None:
        self._repository = repository

    def list(self) -> list[AgentSummary]:
        return self._repository.list()

    def get(self, agent_id: str) -> AgentRecord:
        self._check_id(agent_id)
        return self._repository.get(agent_id)

    def create(self, body: dict[str, Any]) -> AgentRecord:
        """Validate and store a new agent; its id is derived from its name."""
        self._validate(body)
        return self._repository.create_unique(slugify(body.get("name", "")), body)

    def update(
        self, agent_id: str, body: dict[str, Any], *, expected_version: int | None = None
    ) -> AgentRecord:
        self._check_id(agent_id)
        self._validate(body)
        return self._repository.update(agent_id, body, expected_version=expected_version)

    def delete(self, agent_id: str, *, expected_version: int | None = None) -> None:
        self._check_id(agent_id)
        self._repository.delete(agent_id, expected_version=expected_version)

    @staticmethod
    def _check_id(agent_id: str) -> None:
        # A malformed id can't name a stored agent.
        if not AGENT_ID_PATTERN.fullmatch(agent_id):
            raise AgentNotFound(agent_id)

    @staticmethod
    def _validate(body: dict[str, Any]) -> None:
        """Every save goes through the same AgentBuilder the bot runs."""
        try:
            AgentBuilder.from_dict(body)
        except KeyError as e:
            raise InvalidAgent(f"Missing required field {e}.") from e
        except (ValueError, TypeError) as e:
            raise InvalidAgent(str(e)) from e

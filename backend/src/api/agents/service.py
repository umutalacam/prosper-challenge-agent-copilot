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
        """:param repository: Where agents are stored."""
        self._repository = repository

    def list(self) -> list[AgentSummary]:
        """All agents, ordered by name.

        :return: Their summaries, without bodies.
        """
        return self._repository.list()

    def get(self, agent_id: str) -> AgentRecord:
        """One agent at its current version.

        :param agent_id: The agent's id.
        :return: The agent with its body.
        :raises AgentNotFound: If there's no such agent (or the id isn't a valid one).
        """
        self._check_id(agent_id)
        return self._repository.get(agent_id)

    def get_version(self, agent_id: str, version: int) -> AgentRecord:
        """One saved version of an agent, e.g. the one that's deployed.

        :param agent_id: The agent's id.
        :param version: The version to read.
        :return: The agent as it was saved at that version.
        :raises AgentNotFound: If there's no such agent or version.
        """
        self._check_id(agent_id)
        return self._repository.get_version(agent_id, version)

    def create(self, body: dict[str, Any]) -> AgentRecord:
        """Validate and store a new agent; its id is derived from its name.

        :param body: The agent document.
        :return: The stored agent at version 1.
        :raises InvalidAgent: If AgentBuilder rejects it.
        """
        self._validate(body)
        return self._repository.create_unique(slugify(body.get("name", "")), body)

    def update(
        self, agent_id: str, body: dict[str, Any], *, expected_version: int | None = None
    ) -> AgentRecord:
        """Validate and store a new version of an agent.

        :param agent_id: The agent to update.
        :param body: The new agent document.
        :param expected_version: The version the caller loaded; None skips the check.
        :return: The agent at its new version.
        :raises AgentNotFound: If there's no such agent.
        :raises InvalidAgent: If AgentBuilder rejects the body.
        :raises VersionConflict: If it was saved elsewhere since ``expected_version``.
        """
        self._check_id(agent_id)
        self._validate(body)
        return self._repository.update(agent_id, body, expected_version=expected_version)

    def delete(self, agent_id: str, *, expected_version: int | None = None) -> None:
        """Delete an agent with its history, deployments and stored calls.

        :param agent_id: The agent to delete.
        :param expected_version: The version the caller loaded; None skips the check.
        :raises AgentNotFound: If there's no such agent.
        :raises VersionConflict: If it was saved elsewhere since ``expected_version``.
        """
        self._check_id(agent_id)
        self._repository.delete(agent_id, expected_version=expected_version)

    @staticmethod
    def _check_id(agent_id: str) -> None:
        """Treat an id that can't exist as unknown, before touching the database.

        :param agent_id: The id from the request.
        :raises AgentNotFound: If it isn't lowercase letters, digits and dashes.
        """
        if not AGENT_ID_PATTERN.fullmatch(agent_id):
            raise AgentNotFound(agent_id)

    @staticmethod
    def _validate(body: dict[str, Any]) -> None:
        """Run the bot's own loader over a body, so nothing the bot can't run is stored.

        :param body: The agent document.
        :raises InvalidAgent: If AgentBuilder rejects it.
        """
        try:
            AgentBuilder.from_dict(body)
        except KeyError as e:
            raise InvalidAgent(f"Missing required field {e}.") from e
        except (ValueError, TypeError) as e:
            raise InvalidAgent(str(e)) from e

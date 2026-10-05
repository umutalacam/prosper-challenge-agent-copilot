import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.agents.repository import AgentRepository
from api.calls.copilot_analyzer import CopilotAnalyzer
from api.calls.repository import CallRecord, CallRepository, Outcome
from api.copilot.model import CopilotModel
from config import CALLS_DIR, SEED_SQL
from api.bot.repository import DeploymentRepository
from dependencies import get_agent_repository, get_copilot_analyzer, get_call_repository, get_deployment_repository
from main import create_app
from tests.copilot_fakes import ScriptedModel

EXAMPLE = Path(__file__).resolve().parent.parent / "example_flow.json"


@pytest.fixture
def repository(tmp_path: Path) -> AgentRepository:
    """An empty agent database in a temporary file.

    :param tmp_path: The test's temporary directory.
    :return: Its repository.
    """
    return AgentRepository(tmp_path / "agents.db")


@pytest.fixture
def api_db(tmp_path: Path) -> Path:
    """The ``client`` app's throwaway database file; open your own repository on it to seed.

    :param tmp_path: The test's temporary directory.
    :return: The database path.
    """
    return tmp_path / "api.db"


@pytest.fixture
def client(api_db: Path):
    """The real app on a throwaway database, seeded like a first run.

    :param api_db: The database file both repositories use.
    :return: A test client, while the app runs.
    """
    test_repository = AgentRepository(api_db, seed=SEED_SQL)
    test_calls = CallRepository(api_db)
    test_deployments = DeploymentRepository(api_db)
    app = create_app()
    app.dependency_overrides[get_agent_repository] = lambda: test_repository
    app.dependency_overrides[get_call_repository] = lambda: test_calls
    app.dependency_overrides[get_deployment_repository] = lambda: test_deployments
    app.dependency_overrides[get_copilot_analyzer] = lambda: make_copilot_analyzer()
    with TestClient(app) as client:
        yield client


@pytest.fixture
def example_body() -> dict:
    """:return: The reference agent, ``example_flow.json``."""
    return json.loads(EXAMPLE.read_text())


def make_agent(name: str = "Test agent", nodes: int = 1) -> dict:
    """A minimal valid agent: a chain of nodes, each with one action to the next.

    :param name: The agent's name.
    :param nodes: How many nodes (``n0`` → ``n1`` → …).
    :return: The agent document.
    """
    names = [f"n{i}" for i in range(nodes)]
    return {
        "name": name,
        "initial_node": names[0],
        "nodes": [
            {
                "name": n,
                "task_messages": [],
                "edges": (
                    [{"function": f"to_{names[i + 1]}", "description": "", "target": names[i + 1]}]
                    if i + 1 < nodes
                    else []
                ),
            }
            for i, n in enumerate(names)
        ],
    }


def make_copilot_analyzer(client: ScriptedModel | None = None) -> CopilotAnalyzer:
    """A copilot analyzer over a scripted OpenAI client, with the real prompt and schema.

    :param client: The scripted client; one with no answers when omitted.
    :return: The copilot analyzer.
    """
    return CopilotAnalyzer(CopilotModel(client or ScriptedModel(), "test-model"), CALLS_DIR, "test-model")


CALL_T0 = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)


def make_call(
    call_id: str,
    agent_id: str = "desk",
    *,
    minutes: int = 0,
    stuck_in: str | None = None,
    outcome: Outcome = "abandoned",
) -> CallRecord:
    """A stored call that ended in ``n0`` after 1.5 s, for seeding.

    :param call_id: Its id.
    :param agent_id: The agent it ran.
    :param minutes: When it started, in minutes after CALL_T0.
    :param stuck_in: A node to record a ``stuck`` event in.
    :param outcome: How it ended.
    :return: The record.
    """
    events = [
        {"type": "started", "node": "n0", "at_ms": 0},
        {"type": "bot", "node": "n0", "text": "Hi", "reply": 1, "interrupted": False, "at_ms": 400},
    ]
    if stuck_in:
        events.append({"type": "stuck", "node": stuck_in, "replies": 3, "at_ms": 900})
    events.append({"type": "ended", "node": "n0", "outcome": outcome, "at_ms": 1500})
    started = CALL_T0 + timedelta(minutes=minutes)
    return CallRecord(
        id=call_id,
        agent_id=agent_id,
        agent_version=2,
        agent_name="Desk",
        started_at=started,
        ended_at=started + timedelta(milliseconds=1500),
        outcome=outcome,
        end_node="n0",
        path=["n0"],
        final_state={"name": "Ana"},
        events=events,
    )

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.agents.repository import AgentRepository
from config import SEED_SQL
from dependencies import get_agent_repository
from main import create_app

EXAMPLE = Path(__file__).resolve().parent.parent / "example_flow.json"


@pytest.fixture
def repository(tmp_path: Path) -> AgentRepository:
    return AgentRepository(tmp_path / "agents.db")


@pytest.fixture
def client(tmp_path: Path):
    """The real app on a throwaway database, seeded like a first run."""
    test_repository = AgentRepository(tmp_path / "api.db", seed=SEED_SQL)
    app = create_app()
    app.dependency_overrides[get_agent_repository] = lambda: test_repository
    with TestClient(app) as client:
        yield client


@pytest.fixture
def example_body() -> dict:
    return json.loads(EXAMPLE.read_text())


def make_agent(name: str = "Test agent", nodes: int = 1) -> dict:
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

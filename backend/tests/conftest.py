import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import create_app
from storage import SEED_SQL, AgentRepository

EXAMPLE = Path(__file__).resolve().parent.parent / "example_flow.json"


@pytest.fixture
def repository(tmp_path: Path) -> AgentRepository:
    return AgentRepository(tmp_path / "agents.db")


@pytest.fixture
def client(tmp_path: Path):
    """The real app on a throwaway database, seeded like a first run."""
    app = create_app(lambda: AgentRepository(tmp_path / "api.db", seed=SEED_SQL))
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

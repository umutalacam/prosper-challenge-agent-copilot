import sqlite3
import threading

import pytest

from api.agents.repository import (
    AgentExists,
    AgentNotFound,
    AgentRepository,
    VersionConflict,
)
from config import SEED_SQL

from .conftest import make_agent


def history(repository: AgentRepository, agent_id: str) -> list[int]:
    """Saved versions, read straight from the history table."""
    with sqlite3.connect(repository.path) as conn:
        rows = conn.execute(
            "SELECT version FROM agent_versions WHERE agent_id = ? ORDER BY version", (agent_id,)
        ).fetchall()
    return [r[0] for r in rows]


def test_create_and_get_round_trip(repository: AgentRepository):
    created = repository.create("a", make_agent("Alpha", nodes=2))
    loaded = repository.get("a")
    assert created.version == loaded.version == 1
    assert loaded.body == make_agent("Alpha", nodes=2)


def test_create_refuses_existing_id(repository: AgentRepository):
    repository.create("a", make_agent())
    with pytest.raises(AgentExists):
        repository.create("a", make_agent())


def test_create_unique_suffixes_taken_ids(repository: AgentRepository):
    ids = [repository.create_unique("agent", make_agent()).id for _ in range(3)]
    assert ids == ["agent", "agent-2", "agent-3"]


def test_list_is_sorted_by_name_with_generated_columns(repository: AgentRepository):
    repository.create("b", make_agent("beta", nodes=3))
    repository.create("a", make_agent("Alpha", nodes=1))
    summaries = repository.list()
    assert [(s.id, s.name, s.node_count, s.version) for s in summaries] == [
        ("a", "Alpha", 1, 1),
        ("b", "beta", 3, 1),
    ]


def test_update_bumps_version_and_keeps_history(repository: AgentRepository):
    repository.create("a", make_agent("v1"))
    updated = repository.update("a", make_agent("v2"), expected_version=1)
    assert updated.version == 2
    assert repository.get("a").body["name"] == "v2"
    assert history(repository, "a") == [1, 2]


def test_update_with_stale_version_conflicts_and_changes_nothing(repository):
    repository.create("a", make_agent("v1"))
    repository.update("a", make_agent("v2"))
    with pytest.raises(VersionConflict) as info:
        repository.update("a", make_agent("stale"), expected_version=1)
    assert info.value.actual == 2
    assert repository.get("a").body["name"] == "v2"


def test_update_without_version_is_unconditional(repository: AgentRepository):
    repository.create("a", make_agent())
    assert repository.update("a", make_agent("x")).version == 2


def test_missing_agent_raises_not_found(repository: AgentRepository):
    with pytest.raises(AgentNotFound):
        repository.get("nope")
    with pytest.raises(AgentNotFound):
        repository.update("nope", make_agent())
    with pytest.raises(AgentNotFound):
        repository.delete("nope")


def test_delete_removes_agent_and_history(repository: AgentRepository):
    repository.create("a", make_agent())
    repository.delete("a")
    assert repository.count() == 0
    assert history(repository, "a") == []


def test_delete_with_stale_version_conflicts(repository: AgentRepository):
    repository.create("a", make_agent())
    repository.update("a", make_agent())
    with pytest.raises(VersionConflict):
        repository.delete("a", expected_version=1)
    assert repository.get("a").version == 2


def test_schema_is_idempotent_and_data_survives_reopen(tmp_path):
    path = tmp_path / "agents.db"
    AgentRepository(path).create("a", make_agent())
    assert AgentRepository(path).count() == 1  # schema.sql re-applied without harm


def test_seed_loads_the_sample_agent_into_an_empty_database(tmp_path, example_body):
    repository = AgentRepository(tmp_path / "agents.db", seed=SEED_SQL)
    record = repository.get("prosper-scheduler")
    assert record.body == example_body  # seed.sql matches example_flow.json
    assert record.version == 1
    assert history(repository, "prosper-scheduler") == [1]


def test_seed_never_runs_on_a_database_with_agents(tmp_path):
    path = tmp_path / "agents.db"
    AgentRepository(path).create("mine", make_agent())
    reopened = AgentRepository(path, seed=SEED_SQL)
    assert [s.id for s in reopened.list()] == ["mine"]


def test_concurrent_conditional_updates_let_exactly_one_win(repository):
    repository.create("a", make_agent())
    results: list[str] = []

    def save(name: str) -> None:
        try:
            repository.update("a", make_agent(name), expected_version=1)
            results.append("ok")
        except VersionConflict:
            results.append("conflict")

    threads = [threading.Thread(target=save, args=(f"t{i}",)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == ["conflict"] * 7 + ["ok"]
    assert repository.get("a").version == 2

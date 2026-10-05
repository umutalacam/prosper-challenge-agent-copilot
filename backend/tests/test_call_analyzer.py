from dataclasses import replace
from datetime import timedelta

import pytest

from api.calls.analyzer import CallAnalyzer
from api.calls.repository import CallIssue, CallRecord
from tests.conftest import make_call as call


@pytest.fixture
def analyzer() -> CallAnalyzer:
    """:return: The analyzer under test."""
    return CallAnalyzer()


def two_steps(**overrides) -> CallRecord:
    """A call through ``greeting`` → ``confirm``, improvising in the greeting, ended 60 s in.

    :param overrides: CallRecord fields to change.
    :return: The record.
    """
    base = call("c1", outcome="completed")
    record = replace(
        base,
        ended_at=base.started_at + timedelta(seconds=60),
        end_node="confirm",
        path=["greeting", "confirm"],
        events=[
            {"type": "started", "node": "greeting", "at_ms": 100},
            *({"type": "bot", "node": "greeting", "text": "…", "reply": n, "interrupted": False, "at_ms": n * 3000}
              for n in (1, 2, 3)),
            {"type": "stuck", "node": "greeting", "replies": 3, "at_ms": 9000},
            {"type": "transition", "from": "greeting", "to": "confirm", "function": "record_caller",
             "args": {"name": "Ana"}, "state": {"name": "Ana"}, "at_ms": 20_000},
            {"type": "ended", "node": "confirm", "outcome": "completed", "at_ms": 60_000},
        ],
    )
    return replace(record, **overrides)


def test_steps_follow_the_timeline_with_stays_replies_exits_and_the_ending(analyzer: CallAnalyzer):
    assert analyzer.steps(two_steps()) == [
        {"node": "greeting", "entered_ms": 100, "stay_ms": 19_900, "replies": 3,
         "exit": {"function": "record_caller", "args": {"name": "Ana"}}, "ending": None},
        {"node": "confirm", "entered_ms": 20_000, "stay_ms": 40_000, "replies": 0, "exit": None, "ending": "completed"},
    ]


def test_a_call_that_never_started_has_no_steps_or_issues(analyzer: CallAnalyzer):
    record = call("c1", outcome="not_started")
    ended = {"type": "ended", "node": None, "outcome": "not_started", "at_ms": 5}
    record = replace(record, path=[], end_node=None, events=[ended])
    assert (analyzer.steps(record), analyzer.issues(record)) == ([], [])


def test_improvising_in_a_node_the_call_moved_on_from_is_a_long_stay(analyzer: CallAnalyzer):
    assert analyzer.issues(two_steps()) == [CallIssue("long_stay", "greeting", 0, 9000, replies=3)]


def test_improvising_where_an_unfinished_call_ended_is_stuck(analyzer: CallAnalyzer):
    assert analyzer.issues(call("c1", stuck_in="n0")) == [CallIssue("stuck", "n0", 0, 900, replies=3)]


def test_a_completed_call_is_never_stuck(analyzer: CallAnalyzer):
    assert analyzer.issues(call("c1", stuck_in="n0", outcome="completed"))[0].kind == "long_stay"


def test_an_error_is_an_issue_and_keeps_earlier_long_stays_apart(analyzer: CallAnalyzer):
    record = two_steps(outcome="error")
    record = replace(
        record,
        events=[
            *record.events,
            {"type": "stuck", "node": "confirm", "replies": 3, "at_ms": 50_000},
            {"type": "error", "message": "RuntimeError: boom", "at_ms": 60_000},
        ],
    )
    issues = analyzer.issues(record)
    assert [(i.kind, i.node, i.step) for i in issues] == [
        ("long_stay", "greeting", 0),
        ("stuck", "confirm", 1),
        ("error", "confirm", 1),
    ]
    assert issues[-1].message == "RuntimeError: boom"


def test_a_revisited_node_is_judged_per_stay(analyzer: CallAnalyzer):
    record = two_steps(outcome="abandoned", end_node="greeting", path=["greeting", "confirm", "greeting"])
    back = {"type": "transition", "from": "confirm", "to": "greeting", "function": "back", "args": {}, "state": {}}
    record = replace(record, events=[*record.events[:-1], back | {"at_ms": 30_000}])
    # Stuck the first time, but the call ended on its second, short stay: a long stay, not stuck.
    assert [(i.kind, i.step) for i in analyzer.issues(record)] == [("long_stay", 0)]
    assert [s["node"] for s in analyzer.steps(record)] == ["greeting", "confirm", "greeting"]

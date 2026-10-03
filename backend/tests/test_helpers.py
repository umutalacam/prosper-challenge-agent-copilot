import pytest
from fastapi import HTTPException

from helpers import parse_if_match, slugify, strip_response_keys


@pytest.mark.parametrize(
    ("name", "slug"),
    [("Prosper Scheduler", "prosper-scheduler"), ("  Dr. Lee's  Clinic! ", "dr-lee-s-clinic"), ("", "agent")],
)
def test_slugify(name: str, slug: str):
    assert slugify(name) == slug


@pytest.mark.parametrize(("header", "version"), [(None, None), ("3", 3), ('"3"', 3), (' "12" ', 12)])
def test_parse_if_match(header: str | None, version: int | None):
    assert parse_if_match(header) == version


def test_parse_if_match_rejects_non_numbers():
    with pytest.raises(HTTPException) as info:
        parse_if_match("abc")
    assert info.value.status_code == 400


def test_strip_response_keys_keeps_the_agent_document():
    data = {"id": "x", "version": 2, "updated_at": "t", "name": "A", "nodes": []}
    assert strip_response_keys(data) == {"name": "A", "nodes": []}

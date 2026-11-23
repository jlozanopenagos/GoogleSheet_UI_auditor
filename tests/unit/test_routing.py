"""Unit tests for canonical ID routing and Google Sheet URL parsing."""

from __future__ import annotations

import pytest

from app.core.config import extract_gid, extract_spreadsheet_id
from app.core.routing import IdRoutingError, parse_and_route_id

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("raw_id", "expected_lang", "expected_type"),
    [
        ("EE01", "english", "expression"),
        ("EG03", "english", "game"),
        ("ER15", "english", "roleplay"),
        ("EF02", "english", "fun_facts"),
        ("FE01", "french", "expression"),
        ("FG04", "french", "game"),
        ("FR02", "french", "roleplay"),
        ("FF10", "french", "fun_facts"),
        ("SE08", "spanish", "expression"),
        ("SG02", "spanish", "game"),
        ("SR04", "spanish", "roleplay"),
        ("SF01", "spanish", "fun_facts"),
        ("IE02", "italian", "expression"),
        ("IG05", "italian", "game"),
        ("IR01", "italian", "roleplay"),
        ("IF03", "italian", "fun_facts"),
    ],
)
def test_valid_canonical_ids_across_all_languages(raw_id: str, expected_lang: str, expected_type: str):
    parsed = parse_and_route_id(raw_id)
    assert parsed.canonical_id == raw_id
    assert parsed.language == expected_lang
    assert parsed.video_type == expected_type
    assert len(parsed.spreadsheet_id) > 10


def test_single_digit_and_lowercase_id_normalizes_to_canonical():
    parsed = parse_and_route_id("  ee5 ")
    assert parsed.canonical_id == "EE05"
    assert parsed.index == 5


@pytest.mark.parametrize("bad_id", ["", "XYZ", "123", "E01", "EE", "ZZ01", "EEXX", "None"])
def test_invalid_id_formats_raise_routing_error(bad_id: str):
    with pytest.raises(IdRoutingError):
        parse_and_route_id(bad_id)


def test_extract_spreadsheet_id_and_gid():
    url = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit#gid=987654321"
    assert extract_spreadsheet_id(url) == "1AbCdEfGhIjKlMnOpQrStUvWxYz123456"
    assert extract_gid(url) == "987654321"
    assert extract_gid("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit") is None

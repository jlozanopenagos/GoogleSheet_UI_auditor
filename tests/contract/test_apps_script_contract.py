"""Static contract verification between backend SheetService payloads and apps_script/Code.gs."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

CODE_GS_PATH = Path(__file__).resolve().parent.parent.parent / "apps_script" / "Code.gs"


def _load_code_gs() -> str:
    assert CODE_GS_PATH.exists(), f"Missing Apps Script file: {CODE_GS_PATH}"
    return CODE_GS_PATH.read_text(encoding="utf-8")


def test_dopost_dispatches_all_backend_actions():
    src = _load_code_gs()
    for action, handler in [
        ("update_script", "handleUpdateScript"),
        ("update_description", "handleUpdateDescription"),
        ("update_title", "handleUpdateTitle"),
        ("update_launch", "handleUpdateLaunch"),
        ("batch_update", "handleBatchUpdate"),
    ]:
        assert f'action === "{action}"' in src
        assert f"function {handler}(" in src

    # Standalone auditor script must reject unknown actions instead of falling back to legacy handlers
    assert "Unsupported action" in src


def test_handle_update_launch_returns_updated_fields_and_fields_supported():
    src = _load_code_gs()
    match = re.search(r"function handleUpdateLaunch\(sheet, payload\)\s*\{(.*?)\n\}", src, re.DOTALL)
    assert match, "handleUpdateLaunch function not found in Code.gs"
    body = match.group(1)

    for field in ("script_ready", "script_date", "video_ready", "video_date"):
        assert f"payload.{field}" in body
    assert "updated_fields: updatedFields" in body


def test_date_writes_enforce_plain_text_number_format():
    src = _load_code_gs()
    # Both handleUpdateScript, handleUpdateLaunch, and handleBatchUpdate must prevent US-locale MM/DD flips
    for col_key in ("colMap.script_date", "colMap.video_date"):
        matches = re.findall(rf"{re.escape(col_key)} \+ 1\)\.setNumberFormat\([\"']@[\"']\)\.setValue", src)
        assert len(matches) >= 2, f"Expected .setNumberFormat('@').setValue for {col_key} across handlers"


def test_doget_returns_all_expected_schema_keys():
    src = _load_code_gs()
    for key in (
        "ID:",
        "expression:",
        "script:",
        "SCRIPT_CHANGED:",
        "script_ready:",
        "script_date:",
        "video_ready:",
        "video_date:",
        "short_description:",
        "short_title:",
    ):
        assert key in src


def test_handle_update_title_and_header_init():
    src = _load_code_gs()
    match = re.search(r"function handleUpdateTitle\(sheet, payload\)\s*\{(.*?)\n\}", src, re.DOTALL)
    assert match, "handleUpdateTitle function not found in Code.gs"
    body = match.group(1)

    assert "colMap.short_title + 1" in body
    assert "Short title cannot be empty" in body
    assert 'updated_fields: ["short_title"]' in body

    # Ensure Column I & J header auto-initialization is present
    assert 'sheet.getRange(1, 9).setValue("short_description")' in src
    assert 'sheet.getRange(1, 10).setValue("short_title")' in src

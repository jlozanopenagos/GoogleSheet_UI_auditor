"""Unit tests for CalendarService normalization, readiness gate, cadence, JSON recovery & reconciliation."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.calendar_service import CalendarService, normalize_launch_date
from helpers import make_script_record

pytestmark = pytest.mark.unit


def test_normalize_launch_date_formats():
    assert normalize_launch_date("2026-11-20") == ("2026-11-20", "20/11/26")
    assert normalize_launch_date("20/11/26") == ("2026-11-20", "20/11/26")
    assert normalize_launch_date("20/11/2026") == ("2026-11-20", "20/11/26")

    for bad in ("", "31/02/26", "not-a-date"):
        with pytest.raises(ValueError):
            normalize_launch_date(bad)


def test_readiness_gate_and_auto_check_col_e(cal_service: CalendarService):
    missing_desc = make_script_record(
        cid="EF01",
        video_type="fun_facts",
        script_ready=True,
        short_description="",
    )
    r1 = cal_service.evaluate_readiness(missing_desc)
    assert not r1["readiness_ok"]
    assert r1["recommended_action"] == "description_creation"

    missing_script = make_script_record(
        cid="EF02",
        video_type="fun_facts",
        script_ready=True,
        script_changed="",
        short_description="Has desc #Shorts",
    )
    r_scr = cal_service.evaluate_readiness(missing_script)
    assert not r_scr["readiness_ok"]
    assert r_scr["recommended_action"] == "script_auditor"

    only_col_e_unchecked = make_script_record(
        cid="EF01",
        video_type="fun_facts",
        script_ready=False,
        short_description="SEO description #Shorts",
    )
    r2 = cal_service.evaluate_readiness(only_col_e_unchecked)
    assert not r2["readiness_ok"]
    assert r2["can_auto_check_col_e"]
    assert r2["recommended_action"] == "auto_check_col_e"


def test_corrupt_json_recovery_on_load(tmp_path: Path):
    cal_file = tmp_path / "corrupt.json"
    cal_file.write_text("{invalid json!!", encoding="utf-8")

    svc = CalendarService(storage_path=cal_file)
    assert svc.list_entries() == []

    # Writing a new entry recovers cleanly
    svc.schedule_entry(
        script_id="EE01",
        iso_date="2026-11-20",
        sheet_date="20/11/26",
        language="english",
        video_type="expression",
        expression="Break a leg",
    )
    assert svc.get_entry("EE01")["launch_date"] == "2026-11-20"


def test_reconcile_skips_incomplete_invalid_or_unscheduled(cal_service: CalendarService):
    cal_service.schedule_entry(
        script_id="EE01",
        iso_date="2026-11-20",
        sheet_date="20/11/26",
        language="english",
        video_type="expression",
        expression="Break a leg",
    )
    cal_service.unschedule_entry("EE01")

    added = cal_service.reconcile_from_sheet_records(
        "english",
        "expression",
        [
            # Explicitly unscheduled -> skipped
            {"ID": "EE01", "video_ready": True, "video_date": "20/11/26", "SCRIPT_CHANGED": "S1", "short_description": "D1"},
            # Missing description -> skipped
            {"ID": "EE02", "video_ready": True, "video_date": "20/11/26", "SCRIPT_CHANGED": "S2", "short_description": ""},
            # Invalid date -> skipped
            {"ID": "EE03", "video_ready": True, "video_date": "99/99/99", "SCRIPT_CHANGED": "S3", "short_description": "D3"},
            # Valid completed row -> imported
            {"ID": "EE04", "video_ready": True, "video_date": "19/11/26", "SCRIPT_CHANGED": "S4", "short_description": "D4"},
        ],
    )
    assert added == 1
    assert cal_service.get_entry("EE01") is None
    assert cal_service.get_entry("EE04")["launch_date"] == "2026-11-19"

    # clear_unscheduled_ids allows re-importing EE01 on subsequent reconcile
    cleared = cal_service.clear_unscheduled_ids()
    assert cleared == 1
    readded = cal_service.reconcile_from_sheet_records(
        "english",
        "expression",
        [{"ID": "EE01", "video_ready": True, "video_date": "20/11/26", "SCRIPT_CHANGED": "S1", "short_description": "D1"}],
    )
    assert readded == 1
    assert cal_service.get_entry("EE01")["launch_date"] == "2026-11-20"


def test_move_entry_overwrites_date_and_summarize_entries(cal_service: CalendarService):
    for cid, vtype in [("EE01", "expression"), ("EG01", "game"), ("ER01", "roleplay")]:
        cal_service.schedule_entry(
            script_id=cid,
            iso_date="2026-11-20",
            sheet_date="20/11/26",
            language="english",
            video_type=vtype,
            expression=f"Expr {cid}",
        )
    cal_service.schedule_entry(
        script_id="EF01",
        iso_date="2026-11-21",
        sheet_date="21/11/26",
        language="english",
        video_type="fun_facts",
        expression="Fun Fact",
    )

    cadence = cal_service.evaluate_daily_cadence(
        script_id="EE01",
        language="english",
        video_type="expression",
        iso_date="2026-11-22",
        sheet_date="22/11/26",
    )
    assert "will move to 22/11/26" in cadence["move_note"]

    entries = cal_service.list_entries(month="2026-11", language="english")
    summary = cal_service.summarize_entries(entries)
    assert summary["total"] == 4
    assert summary["fun_fact_days"] == 1
    assert summary["triad_complete_days"] == 1

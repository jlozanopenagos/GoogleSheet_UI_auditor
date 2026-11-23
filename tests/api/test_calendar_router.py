"""API contract tests for routers/calendar.py (/entries, /check, /schedule, /sync, DELETE)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# pyrefly: ignore[missing-import]
from app.services.sheet_service import SheetServiceError
# pyrefly: ignore[missing-import]
from helpers import make_script_record

pytestmark = pytest.mark.api


def test_calendar_preflight_check_and_entries(api_client: TestClient):
    with patch(
        "app.routers.calendar.sheet_service.fetch_script_by_id",
        return_value=make_script_record(cid="EE05", expression="Once in a blue moon"),
    ):
        chk_resp = api_client.post("/api/calendar/check", json={"script_id": "EE05", "launch_date": "20/11/26"})
    assert chk_resp.status_code == 200
    chk_data = chk_resp.json()["data"]
    assert chk_data["readiness"]["readiness_ok"]
    assert chk_data["cadence"]["cadence_ok"]
    assert chk_data["sheet_date"] == "20/11/26"

    list_resp = api_client.get("/api/calendar/entries")
    assert list_resp.status_code == 200
    assert list_resp.json()["data"]["entries"] == []


def test_per_language_daily_cadence_and_force_override(api_client: TestClient):
    with patch("app.routers.calendar.sheet_service.fetch_script_by_id") as mock_fetch, patch(
        "app.routers.calendar.sheet_service.update_launch_fields"
    ) as mock_upd:
        mock_upd.return_value = {"status": "success", "updated_fields": ["video_ready", "video_date"]}

        # 1. Fun Fact day in English passes
        mock_fetch.return_value = make_script_record(cid="EF01", language="english", video_type="fun_facts")
        r1 = api_client.post("/api/calendar/schedule", json={"script_id": "EF01", "launch_date": "2026-11-20"})
        assert r1.status_code == 200
        assert r1.json()["success"]
        assert r1.json()["data"]["sheet_synced"] is True

        # 2. English Expression on same Fun Fact day triggers soft warning
        mock_fetch.return_value = make_script_record(cid="EE01", language="english", video_type="expression")
        r2 = api_client.post("/api/calendar/schedule", json={"script_id": "EE01", "launch_date": "2026-11-20"})
        assert r2.status_code == 200
        assert not r2.json()["success"]
        assert r2.json()["data"]["requires_override"]

        # 3. Independent Spanish Fun Fact on same date passes with auto-check Col E shortcut
        mock_fetch.return_value = make_script_record(
            cid="SF01", language="spanish", video_type="fun_facts", script_ready=False
        )
        r3 = api_client.post(
            "/api/calendar/schedule",
            json={"script_id": "SF01", "launch_date": "2026-11-20", "auto_check_script_ready": True},
        )
        assert r3.status_code == 200
        assert r3.json()["success"]

        # 4. Triad Day in English: 1 E + 1 G + 1 R allowed; 2nd E warns unless force_override=True
        for cid, vt in [("EE02", "expression"), ("EG02", "game"), ("ER02", "roleplay")]:
            mock_fetch.return_value = make_script_record(cid=cid, language="english", video_type=vt)
            res = api_client.post("/api/calendar/schedule", json={"script_id": cid, "launch_date": "2026-11-21"})
            assert res.json()["success"]

        mock_fetch.return_value = make_script_record(cid="EE03", language="english", video_type="expression")
        res_dup = api_client.post("/api/calendar/schedule", json={"script_id": "EE03", "launch_date": "2026-11-21"})
        assert not res_dup.json()["success"]
        assert res_dup.json()["data"]["requires_override"]

        res_forced = api_client.post(
            "/api/calendar/schedule",
            json={"script_id": "EE03", "launch_date": "2026-11-21", "force_override": True},
        )
        assert res_forced.json()["success"]


def test_move_date_confirmation_and_strict_sheet_synced_flag(api_client: TestClient):
    with patch(
        "app.routers.calendar.sheet_service.fetch_script_by_id",
        return_value=make_script_record(cid="EE10", language="english", video_type="expression"),
    ), patch(
        "app.routers.calendar.sheet_service.update_launch_fields"
    ) as mock_upd:
        # Missing updated_fields must keep sheet_synced=False (no false positive!)
        mock_upd.return_value = {"status": "success", "updated_count": 0}
        first = api_client.post("/api/calendar/schedule", json={"script_id": "EE10", "launch_date": "2026-11-20"})
        assert first.json()["success"]
        assert first.json()["data"]["sheet_synced"] is False

        # Moving to a different date with allow_move=False triggers confirmation
        move_blocked = api_client.post(
            "/api/calendar/schedule",
            json={"script_id": "EE10", "launch_date": "2026-11-22", "allow_move": False},
        )
        assert not move_blocked.json()["success"]
        assert move_blocked.json()["data"]["requires_override"]

        mock_upd.return_value = {"status": "success", "updated_fields": ["video_ready", "video_date"]}
        move_ok = api_client.post(
            "/api/calendar/schedule",
            json={"script_id": "EE10", "launch_date": "2026-11-22", "allow_move": True},
        )
        assert move_ok.json()["success"]
        assert move_ok.json()["data"]["sheet_synced"] is True
        assert move_ok.json()["data"]["entry"]["launch_date"] == "2026-11-22"


def test_sync_endpoint_and_sheet_error_graceful_fallback(api_client: TestClient):
    with patch(
        "app.routers.calendar.sheet_service.sync_calendar_from_all_sheets",
        return_value={"synced_added": 2, "tabs_checked": 16, "errors": []},
    ):
        resp = api_client.post("/api/calendar/sync")
    assert resp.status_code == 200
    assert resp.json()["success"]
    assert resp.json()["data"]["synced_added"] == 2

    # If Google Sheet sync throws SheetServiceError during schedule, entry still saves locally with sheet_synced=False
    with patch(
        "app.routers.calendar.sheet_service.fetch_script_by_id",
        return_value=make_script_record(cid="EE11"),
    ), patch(
        "app.routers.calendar.sheet_service.update_launch_fields",
        side_effect=SheetServiceError("Network timeout"),
    ):
        res = api_client.post("/api/calendar/schedule", json={"script_id": "EE11", "launch_date": "2026-11-23"})
    assert res.status_code == 200
    assert res.json()["success"]
    assert res.json()["data"]["sheet_synced"] is False
    assert "Network timeout" in res.json()["data"]["sheet_sync_warning"]

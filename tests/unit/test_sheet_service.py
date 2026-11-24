"""Unit tests for SheetService CRUD, 4-state matrix, Code.gs guard, and parallel sheet sync."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.config import ENDPOINT_REGISTRY
from app.services.calendar_service import CalendarService
from app.services.sheet_service import ScriptNotFoundError, SheetService, SheetServiceError
from helpers import make_sheet_row

pytestmark = pytest.mark.unit


@patch.object(SheetService, "_http_get")
def test_fetch_script_by_id_success_and_not_found(mock_get):
    mock_get.return_value = {
        "status": "success",
        "count": 2,
        "data": [
            make_sheet_row(
                cid="EE01",
                expression="Break a leg",
                script="Original script for EE01",
                script_changed="New script for EE01",
                short_description="Curiosity description #Shorts #LearnEnglish",
                short_title="Why natives say Break a Leg",
            ),
            make_sheet_row(cid="EE02", expression="Bite the bullet", script="Original script for EE02"),
        ],
    }

    service = SheetService()
    record = service.fetch_script_by_id("EE01")
    assert record.ID == "EE01"
    assert record.expression == "Break a leg"
    assert record.SCRIPT_CHANGED == "New script for EE01"
    assert record.script_ready is True
    assert record.short_title == "Why natives say Break a Leg"

    mock_get.return_value = {"status": "success", "count": 1, "data": [{"ID": "EE02"}]}
    with pytest.raises(ScriptNotFoundError):
        service.fetch_script_by_id("EE01")


@patch.object(SheetService, "_http_get")
def test_fetch_matrix_category_four_states(mock_get, cal_service: CalendarService):
    cal_service.schedule_entry(
        script_id="EE04",
        iso_date="2026-11-20",
        sheet_date="20/11/26",
        language="english",
        video_type="expression",
        expression="Launched item",
    )
    mock_get.return_value = {
        "status": "success",
        "count": 4,
        "data": [
            make_sheet_row(cid="EE01", script_changed="New script", short_description="Desc #Shorts", short_title="Title EE01"),
            make_sheet_row(cid="EE02", script_changed="Doctored script", short_description="", short_title="", script_ready=False),
            make_sheet_row(cid="EE03", script_changed="", short_description="", short_title="", script_ready=False),
            make_sheet_row(cid="EE04", script_changed="New script", short_description="Desc #Shorts", short_title="Title EE04"),
        ],
    }

    service = SheetService()
    result = service.fetch_matrix_category("english", "expression")
    assert result["count"] == 4
    statuses = {item["id"]: item["status"] for item in result["items"]}
    assert statuses == {"EE01": "green", "EE02": "yellow", "EE03": "grey", "EE04": "violet"}
    titles = {item["id"]: (item["has_short_title"], item["short_title"]) for item in result["items"]}
    assert titles == {
        "EE01": (True, "Title EE01"),
        "EE02": (False, ""),
        "EE03": (False, ""),
        "EE04": (True, "Title EE04"),
    }


@patch.object(SheetService, "_http_post")
def test_update_script_and_description_fields_and_undeployed_guard(mock_post):
    service = SheetService()

    mock_post.return_value = {"status": "success", "id": "EE01", "updated_fields": ["SCRIPT_CHANGED"]}
    assert service.update_script_fields("EE01", "New", True, "22/11/26")["status"] == "success"
    assert service.update_description_field("EE01", "New desc #Shorts")["status"] == "success"

    # Legacy Code.gs placeholder / fallback returns count=0
    mock_post.return_value = {"status": "success", "message": "No rows provided", "count": 0}
    with pytest.raises(SheetServiceError):
        service.update_launch_fields("EE01", True, "22/11/26")

    mock_post.return_value = {"status": "error", "message": "Sheet permission error"}
    with pytest.raises(SheetServiceError):
        service.update_description_field("EE01", "Desc")


@patch.object(SheetService, "_http_post")
def test_update_title_field_validation_and_responses(mock_post):
    service = SheetService()

    # Empty / whitespace-only title is rejected before HTTP call
    with pytest.raises(ValueError, match="cannot be empty"):
        service.update_title_field("EE01", "   ")
    mock_post.assert_not_called()

    # Valid title trims whitespace and sends action="update_title"
    mock_post.return_value = {
        "status": "success",
        "id": "EE01",
        "short_title": "Stop saying this!",
        "updated_fields": ["short_title"],
    }
    res = service.update_title_field("ee01", "  Stop saying this!  ")
    assert res["status"] == "success"
    sent_payload = mock_post.call_args[0][1]
    assert sent_payload["action"] == "update_title"
    assert sent_payload["script_id"] == "EE01"
    assert sent_payload["short_title"] == "Stop saying this!"

    # Stale Apps Script deployment guard
    mock_post.return_value = {"status": "success", "message": "No rows provided", "count": 0}
    with pytest.raises(SheetServiceError):
        service.update_title_field("EE01", "Valid title")

    # Upstream error status
    mock_post.return_value = {"status": "error", "message": "Write permission denied"}
    with pytest.raises(SheetServiceError, match="Write permission denied"):
        service.update_title_field("EE01", "Valid title")


@patch.object(SheetService, "_http_post")
def test_batch_update_ready_items_success(mock_post):
    mock_post.return_value = {"status": "success", "updated_count": 2, "total": 2}
    service = SheetService()
    result = service.batch_update_ready_items(
        language="english",
        video_type="expression",
        updates=[{"id": "EE01", "script_ready": True}, {"id": "EE02", "script_ready": False}],
    )
    assert result["updated_count"] == 2


def test_sync_calendar_from_all_sheets_parallel_and_partial_tab_error(cal_service: CalendarService):
    cal_service.unschedule_entry("EE01")
    service = SheetService()

    def fake_get(url: str):
        # Simulate one tab returning an HTTP/Apps Script error while others succeed
        if "gid=" in url and url.endswith(ENDPOINT_REGISTRY[("french", "fun_facts")].split("gid=")[-1]):
            raise SheetServiceError("Simulated tab timeout")
        if url.endswith(ENDPOINT_REGISTRY[("english", "expression")].split("gid=")[-1]):
            return {
                "status": "success",
                "data": [
                    make_sheet_row(cid="EE01", video_ready=True, video_date="20/11/26"),
                    make_sheet_row(cid="EE02", video_ready=True, video_date="21/11/26"),
                ],
            }
        return {"status": "success", "data": []}

    with patch.object(service, "_http_get", side_effect=fake_get):
        stats = service.sync_calendar_from_all_sheets(clear_unscheduled=True)

    assert stats["tabs_checked"] == len(ENDPOINT_REGISTRY)
    assert stats["synced_added"] == 2
    assert len(stats["errors"]) == 1
    assert cal_service.get_entry("EE01")["launch_date"] == "2026-11-20"
    assert cal_service.get_entry("EE02")["launch_date"] == "2026-11-21"

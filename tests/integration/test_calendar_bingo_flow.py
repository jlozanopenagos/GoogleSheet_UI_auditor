"""End-to-end integration tests for Calendar <-> SheetService <-> 4-State Violet Bingo."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# pyrefly: ignore[missing-import]
from app.core.config import ENDPOINT_REGISTRY
# pyrefly: ignore[missing-import]
from app.services.sheet_service import SheetService
# pyrefly: ignore[missing-import]
from helpers import make_script_record, make_sheet_row

pytestmark = pytest.mark.integration


def test_full_calendar_violet_move_unschedule_and_resync_lifecycle(api_client: TestClient):
    sheet_state = {
        "EE01": make_sheet_row(cid="EE01", expression="Break a leg", script_changed="Script 1", short_description="Desc 1 #Shorts"),
        "EE02": make_sheet_row(cid="EE02", expression="Bite the bullet", script_changed="Script 2", short_description="Desc 2 #Shorts"),
    }

    def fake_fetch_by_id(raw_id: str):
        cid = raw_id.strip().upper()
        row = sheet_state[cid]
        return make_script_record(
            cid=cid,
            expression=row["expression"],
            script_changed=row["SCRIPT_CHANGED"],
            short_description=row["short_description"],
            video_ready=row["video_ready"],
            video_date=row["video_date"],
        )

    def fake_update_launch(*, script_id: str, video_ready: bool, video_date: str, script_ready=None):
        cid = script_id.strip().upper()
        sheet_state[cid]["video_ready"] = video_ready
        sheet_state[cid]["video_date"] = video_date
        if script_ready is not None:
            sheet_state[cid]["script_ready"] = script_ready
        return {"status": "success", "updated_fields": ["video_ready", "video_date"]}

    def fake_http_get(url: str):
        en_expr_gid = ENDPOINT_REGISTRY[("english", "expression")].split("gid=")[-1]
        if url.endswith(en_expr_gid):
            return {"status": "success", "data": [sheet_state["EE01"], sheet_state["EE02"]]}
        return {"status": "success", "data": []}

    with patch("app.routers.calendar.sheet_service.fetch_script_by_id", side_effect=fake_fetch_by_id), patch(
        "app.routers.calendar.sheet_service.update_launch_fields", side_effect=fake_update_launch
    ), patch.object(SheetService, "_http_get", side_effect=fake_http_get):
        # 1. Schedule EE01 on 2026-11-20 -> turns Violet in Bingo
        sched_resp = api_client.post("/api/calendar/schedule", json={"script_id": "EE01", "launch_date": "2026-11-20"})
        assert sched_resp.json()["success"]

        matrix1 = api_client.get("/api/sheets/matrix/english/expression").json()["data"]["items"]
        by_id1 = {item["id"]: item for item in matrix1}
        assert by_id1["EE01"]["status"] == "violet"
        assert by_id1["EE01"]["launch_date"] == "20/11/26"
        assert by_id1["EE02"]["status"] == "green"

        # 2. Move EE01 to 2026-11-24 -> remains Violet with updated date
        move_resp = api_client.post(
            "/api/calendar/schedule",
            json={"script_id": "EE01", "launch_date": "2026-11-24", "allow_move": True},
        )
        assert move_resp.json()["success"]
        assert sheet_state["EE01"]["video_date"] == "24/11/26"

        # 3. Unschedule EE01 -> reverts to Green & clears sheet date
        del_resp = api_client.delete("/api/calendar/entries/EE01")
        assert del_resp.status_code == 200
        assert del_resp.json()["success"]
        assert sheet_state["EE01"]["video_ready"] is False
        assert sheet_state["EE01"]["video_date"] == ""

        matrix2 = api_client.get("/api/sheets/matrix/english/expression").json()["data"]["items"]
        by_id2 = {item["id"]: item for item in matrix2}
        assert by_id2["EE01"]["status"] == "green"
        assert by_id2["EE01"]["launch_date"] == ""

        # 4. If another PC marks EE02 launched in Google Sheets, Sync from Sheets imports it & turns it Violet
        sheet_state["EE02"]["video_ready"] = True
        sheet_state["EE02"]["video_date"] = "25/11/26"
        sync_resp = api_client.post("/api/calendar/sync")
        assert sync_resp.status_code == 200
        assert sync_resp.json()["data"]["synced_added"] == 1

        matrix3 = api_client.get("/api/sheets/matrix/english/expression").json()["data"]["items"]
        by_id3 = {item["id"]: item for item in matrix3}
        assert by_id3["EE02"]["status"] == "violet"
        assert by_id3["EE02"]["launch_date"] == "25/11/26"

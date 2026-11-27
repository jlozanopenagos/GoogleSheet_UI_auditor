"""API contract tests for routers/youtube.py endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.services.sheet_service import SheetService
from helpers import make_script_record

pytestmark = pytest.mark.api


def test_youtube_auth_status_and_disconnect(api_client: TestClient):
    resp = api_client.get("/api/youtube/auth/status")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "targets" in data
    assert set(data["targets"].keys()) == {"english", "french", "spanish", "italian", "drive"}

    disc = api_client.delete("/api/youtube/auth/english")
    assert disc.status_code == 200
    assert disc.json()["success"] is True

    bad_disc = api_client.delete("/api/youtube/auth/klingon")
    assert bad_disc.status_code == 400


@patch("app.routers.youtube.youtube_upload_service.list_channel_playlists")
@patch("app.routers.youtube.drive_asset_service.list_script_assets")
@patch.object(SheetService, "fetch_script_by_id")
def test_youtube_preflight_returns_assets_and_calendar_suggestion(
    mock_fetch, mock_drive_assets, mock_list_playlists, api_client: TestClient
):
    from app.routers import youtube as yt_router

    yt_router.youtube_auth_service._write_token_data("spanish", {
        "target": "spanish",
        "refresh_token": "r1",
        "channel_id": "UC_ES",
        "channel_title": "Tito Spanish",
    })
    yt_router.youtube_auth_service._write_token_data("drive", {
        "target": "drive",
        "refresh_token": "r_drv",
        "channel_title": "Drive User",
    })
    yt_router.calendar_service.schedule_entry(
        script_id="SE08",
        iso_date="2026-12-15",
        sheet_date="15/12/26",
        language="spanish",
        video_type="expression",
        expression="embarazada",
    )

    mock_fetch.return_value = make_script_record(
        cid="SE08",
        language="spanish",
        video_type="expression",
        short_title="¿Nueva madre o sonrojada?",
        short_description="Spanish desc #Shorts",
    )
    mock_list_playlists.return_value = [
        {"playlist_id": "PL_ES_RP", "title": "Expresiones en acción"},
        {"playlist_id": "PLTqmUDYWor7c", "title": "Expresiones comunes y modismos del día a día"},
    ]
    mock_drive_assets.return_value = {
        "folder_id": "fld_se08",
        "folder_url": "https://drive.google.com/drive/folders/fld_se08",
        "video": {"file_id": "v1", "name": "SE08.mp4", "mime_type": "video/mp4", "size_bytes": 5000, "variant": "video", "preview_url": ""},
        "thumbnails": [
            {"file_id": "t1", "name": "SE08_thumbnail_latam.png", "mime_type": "image/png", "size_bytes": 1000, "variant": "latam", "preview_url": "/api/youtube/drive-preview/t1"},
            {"file_id": "t2", "name": "SE08_thumbnail_spain.png", "mime_type": "image/png", "size_bytes": 1000, "variant": "spain", "preview_url": "/api/youtube/drive-preview/t2"},
        ],
        "requires_thumbnail_choice": True,
    }

    resp = api_client.get("/api/youtube/preflight/SE08")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["channel_status"]["channel_title"] == "Tito Spanish"
    assert body["suggested_launch_date"] == "2026-12-15"
    assert body["drive_assets"]["requires_thumbnail_choice"] is True
    assert len(body["playlists"]) == 2
    assert body["recommended_playlist_id"] == "PLTqmUDYWor7c"


@patch("app.routers.youtube.youtube_upload_service.start_upload_job")
@patch.object(SheetService, "fetch_script_by_id")
def test_youtube_upload_and_job_status_endpoints(mock_fetch, mock_start, api_client: TestClient):
    mock_fetch.return_value = make_script_record(
        cid="EE01",
        short_title="The old theater lucky secret",
        short_description="Desc #Shorts",
    )
    mock_start.return_value = {
        "job_id": "job-abc",
        "script_id": "EE01",
        "stage": "queued",
        "progress_pct": 0,
        "message": "Queued",
    }

    resp = api_client.post(
        "/api/youtube/upload",
        json={
            "script_id": "EE01",
            "thumbnail_file_id": "t_en",
            "playlist_id": "PLAPjpYSDyH_I",
            "playlist_title": "Common Idioms & Everyday Expressions",
            "visibility_mode": "scheduled",
            "scheduled_date": "2026-12-20",
            "scheduled_time": "14:00",
            "timezone_name": "America/Bogota",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["job_id"] == "job-abc"

    mock_start.side_effect = ValueError("Please select a thumbnail")
    bad = api_client.post(
        "/api/youtube/upload",
        json={"script_id": "EE01", "visibility_mode": "public"},
    )
    assert bad.status_code == 400

    missing_job = api_client.get("/api/youtube/jobs/does-not-exist")
    assert missing_job.status_code == 404

"""Unit tests for YouTubeUploadService scheduling, body construction, and upload lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.youtube_upload_service import (
    YouTubeUploadService,
    build_video_insert_body,
    convert_bogota_to_utc_iso,
    recommend_playlist_id,
)

pytestmark = pytest.mark.unit


def test_convert_bogota_to_utc_iso_conversion_and_validation():
    ref_now = datetime(2026, 12, 1, 10, 0, tzinfo=timezone.utc)

    utc_iso, bogota_disp = convert_bogota_to_utc_iso("2026-12-10", "14:30", "America/Bogota", now_utc=ref_now)
    assert utc_iso == "2026-12-10T19:30:00.000Z"
    assert "UTC-05:00" in bogota_disp

    # Late evening Bogota rolls over to next UTC day
    utc_next, _ = convert_bogota_to_utc_iso("2026-12-10", "21:00", "America/Bogota", now_utc=ref_now)
    assert utc_next == "2026-12-11T02:00:00.000Z"

    # Rejects past timestamps
    with pytest.raises(ValueError, match="must be in the future"):
        convert_bogota_to_utc_iso("2026-11-30", "12:00", "America/Bogota", now_utc=ref_now)

    # Rejects malformed time
    with pytest.raises(ValueError, match="Invalid schedule format"):
        convert_bogota_to_utc_iso("2026-12-10", "99:00", "America/Bogota", now_utc=ref_now)


def test_build_video_insert_body_scheduling_and_validation():
    body = build_video_insert_body(
        title="Confesiones equivocadas",
        description="A fun Spanish Short #Shorts",
        language="spanish",
        visibility_mode="scheduled",
        publish_at_utc="2026-12-10T19:30:00.000Z",
    )
    assert body["snippet"]["defaultLanguage"] == "es"
    assert body["snippet"]["categoryId"] == "27"
    # Per YouTube Data API v3 docs, scheduled publishing MUST send privacyStatus='private' + publishAt
    assert body["status"]["privacyStatus"] == "private"
    assert body["status"]["publishAt"] == "2026-12-10T19:30:00.000Z"
    assert body["status"]["selfDeclaredMadeForKids"] is False

    pub_body = build_video_insert_body(
        title="Public Short",
        description="Immediate public #Shorts",
        language="english",
        visibility_mode="public",
    )
    assert pub_body["status"]["privacyStatus"] == "public"
    assert "publishAt" not in pub_body["status"]

    with pytest.raises(ValueError, match="Title|title"):
        build_video_insert_body(title="", description="Desc", language="english")
    with pytest.raises(ValueError, match="100"):
        build_video_insert_body(title="A" * 101, description="Desc", language="english")
    with pytest.raises(ValueError, match="description"):
        build_video_insert_body(title="Valid", description="  ", language="english")


@patch("app.services.youtube_upload_service.drive_asset_service.download_file_to_path")
def test_run_upload_job_sequences_processing_wait_before_thumbnail(mock_dl, tmp_path: Path):
    def fake_download(file_id: str, dest_path: Path, drive_service=None):
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(b"mock-bytes")
        return dest_path

    mock_dl.side_effect = fake_download

    mock_insert_req = MagicMock()
    mock_insert_req.next_chunk.side_effect = [
        (MagicMock(progress=MagicMock(return_value=0.5)), None),
        (None, {"id": "yt_vid_123"}),
    ]

    mock_yt = MagicMock()
    mock_yt.videos.return_value.insert.return_value = mock_insert_req
    mock_yt.playlistItems.return_value.insert.return_value.execute.return_value = {"id": "pl_item_1"}
    mock_yt.videos.return_value.list.return_value.execute.side_effect = [
        {"items": [{"processingDetails": {"processingStatus": "processing"}}]},
        {"items": [{"processingDetails": {"processingStatus": "succeeded"}}]},
    ]
    mock_yt.thumbnails.return_value.set.return_value.execute.return_value = {"items": [{"default": {}}]}

    svc = YouTubeUploadService(history_path=tmp_path / "uploads.json")
    job_id = "job-1"
    svc._jobs[job_id] = {"job_id": job_id, "stage": "queued", "progress_pct": 0}

    body = build_video_insert_body(
        title="Ropa invaluable",
        description="Spanish Short #Shorts",
        language="spanish",
        visibility_mode="scheduled",
        publish_at_utc="2026-12-10T19:00:00.000Z",
    )

    with patch("time.sleep", return_value=None):
        svc._run_upload_job(
            job_id=job_id,
            script_id="SE08",
            language="spanish",
            channel_title="Spanish Channel",
            body=body,
            video_asset={"file_id": "v1", "name": "SE08.mp4", "mime_type": "video/mp4"},
            chosen_thumb={"file_id": "t_latam", "name": "SE08_thumbnail_latam.png", "mime_type": "image/png", "variant": "latam"},
            visibility_mode="scheduled",
            publish_at_utc="2026-12-10T19:00:00.000Z",
            publish_at_bogota="2026-12-10 14:00 America/Bogota (UTC-05:00)",
            playlist_id="PLTqmUDYWor7c",
            playlist_title="Expresiones comunes y modismos del día a día",
            youtube_client=mock_yt,
            drive_client=MagicMock(),
            processing_timeout_sec=10,
            poll_interval_sec=0.01,
        )

    job = svc.get_job(job_id)
    assert job["stage"] == "completed"
    assert job["video_id"] == "yt_vid_123"
    assert job["playlist_added"] is True
    assert job["playlist_id"] == "PLTqmUDYWor7c"
    assert job["thumbnail_applied"] is True
    mock_yt.playlistItems.return_value.insert.assert_called_once()
    mock_yt.thumbnails.return_value.set.assert_called_once()
    assert svc.get_upload_record("SE08")["video_id"] == "yt_vid_123"
    assert svc.get_upload_record("SE08")["playlist_added"] is True


def test_recommend_playlist_id_matches_all_languages_and_formats():
    live_playlists = {
        "english": [
            {"playlist_id": "PL_EN_RP", "title": "Real Life Situations"},
            {"playlist_id": "PL_EN_GM", "title": "Trivia time!!!!"},
            {"playlist_id": "PL_EN_EX", "title": "Common Idioms & Everyday Expressions"},
            {"playlist_id": "PL_EN_FF", "title": "Fun facts"},
        ],
        "french": [
            {"playlist_id": "PL_FR_RP", "title": "Expressions en Action"},
            {"playlist_id": "PL_FR_GM", "title": "Quiz du jour!!!!!"},
            {"playlist_id": "PL_FR_EX", "title": "Expressions Courantes"},
            {"playlist_id": "PL_FR_FF", "title": "Fun facts"},
        ],
        "spanish": [
            {"playlist_id": "PL_ES_RP", "title": "Expresiones en acción"},
            {"playlist_id": "PL_ES_GM", "title": "¡¡¡Trivia del día!!!"},
            {"playlist_id": "PL_ES_EX", "title": "Expresiones comunes y modismos del día a día"},
            {"playlist_id": "PL_ES_FF", "title": "Fun facts"},
        ],
        "italian": [
            {"playlist_id": "PL_IT_RP", "title": "Espressioni in azione"},
            {"playlist_id": "PL_IT_GM", "title": "Quiz del giorno!!!"},
            {"playlist_id": "PL_IT_EX", "title": "Espressioni Comuni & Modi di Dire Quotidiani"},
            {"playlist_id": "PL_IT_FF", "title": "Fun facts"},
        ],
    }

    expected = {
        "english": {"roleplay": "PL_EN_RP", "game": "PL_EN_GM", "expression": "PL_EN_EX", "fun_facts": "PL_EN_FF"},
        "french": {"roleplay": "PL_FR_RP", "game": "PL_FR_GM", "expression": "PL_FR_EX", "fun_facts": "PL_FR_FF"},
        "spanish": {"roleplay": "PL_ES_RP", "game": "PL_ES_GM", "expression": "PL_ES_EX", "fun_facts": "PL_ES_FF"},
        "italian": {"roleplay": "PL_IT_RP", "game": "PL_IT_GM", "expression": "PL_IT_EX", "fun_facts": "PL_IT_FF"},
    }

    for lang, mapping in expected.items():
        for vtype, expected_id in mapping.items():
            assert recommend_playlist_id(live_playlists[lang], lang, vtype) == expected_id

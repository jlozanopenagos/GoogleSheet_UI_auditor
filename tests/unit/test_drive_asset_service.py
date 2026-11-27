"""Unit tests for DriveAssetService folder navigation and Spanish variant detection."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.drive_asset_service import (
    DriveAssetError,
    DriveAssetService,
    detect_thumbnail_variant,
    map_video_type_to_drive_folder,
)

pytestmark = pytest.mark.unit


def test_folder_and_variant_mapping():
    assert map_video_type_to_drive_folder("expression") == "expressions"
    assert map_video_type_to_drive_folder("fun_facts") == "fun_facts"
    assert map_video_type_to_drive_folder("game") == "game"
    assert map_video_type_to_drive_folder("roleplay") == "role_play"
    assert detect_thumbnail_variant("SE08_thumbnail_latam.png") == "latam"
    assert detect_thumbnail_variant("SE08_thumbnail_spain.png") == "spain"
    assert detect_thumbnail_variant("EE01_thumbnail.png") == "default"


def test_list_script_assets_spanish_two_thumbnails_and_english_single():
    responses = [
        {"files": [{"id": "root_id", "name": "_videos terminados"}]},
        {"files": [{"id": "lang_es", "name": "spanish"}]},
        {"files": [{"id": "type_expr", "name": "expressions"}]},
        {"files": [{"id": "id_se08", "name": "SE08"}]},
        {
            "files": [
                {"id": "vid_se08", "name": "SE08.mp4", "mimeType": "video/mp4", "size": "10485760"},
                {"id": "th_spain", "name": "SE08_thumbnail_spain.png", "mimeType": "image/png", "size": "204800"},
                {"id": "th_latam", "name": "SE08_thumbnail_latam.png", "mimeType": "image/png", "size": "204800"},
            ]
        },
    ]

    mock_drive = MagicMock()
    mock_drive.files.return_value.list.return_value.execute.side_effect = responses

    svc = DriveAssetService()
    assets = svc.list_script_assets("SE08", "spanish", "expression", drive_service=mock_drive)
    assert assets["video"]["file_id"] == "vid_se08"
    assert assets["requires_thumbnail_choice"] is True
    assert [t["variant"] for t in assets["thumbnails"]] == ["latam", "spain"]

    # Missing ID folder raises DriveAssetError
    mock_drive.files.return_value.list.return_value.execute.side_effect = [
        {"files": [{"id": "root_id", "name": "_videos terminados"}]},
        {"files": [{"id": "lang_en", "name": "english"}]},
        {"files": [{"id": "type_rp", "name": "role_play"}]},
        {"files": []},
    ]
    with pytest.raises(DriveAssetError, match="ER99"):
        svc.list_script_assets("ER99", "english", "roleplay", drive_service=mock_drive)

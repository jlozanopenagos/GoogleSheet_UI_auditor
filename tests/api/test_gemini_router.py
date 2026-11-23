"""API contract tests for routers/gemini.py (/generate-description, /doctor-script)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# pyrefly: ignore[missing-import]
from app.core.routing import IdRoutingError
# pyrefly: ignore[missing-import]
from app.models.schemas import GeminiGenerateResponse
# pyrefly: ignore[missing-import]
from app.services.gemini_service import GeminiServiceError

pytestmark = pytest.mark.api


@patch("app.routers.gemini.gemini_service.generate_short_description")
def test_generate_description_endpoint_success_and_errors(mock_gen, api_client: TestClient):
    mock_gen.return_value = GeminiGenerateResponse(
        script_id="EE01",
        short_description="Great description #Shorts #LearnEnglish",
        word_count=5,
        character_count=40,
        hashtags=["#Shorts", "#LearnEnglish"],
    )
    resp = api_client.post(
        "/api/gemini/generate-description",
        json={"script_id": "EE01", "expression": "Break a leg", "script_changed": "Final script text"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"]
    assert body["data"]["script_id"] == "EE01"

    mock_gen.side_effect = GeminiServiceError("Rate limited")
    assert (
        api_client.post(
            "/api/gemini/generate-description",
            json={"script_id": "EE01", "expression": "Break a leg", "script_changed": "Final script text"},
        ).status_code
        == 400
    )

    mock_gen.side_effect = IdRoutingError("Invalid ID")
    assert (
        api_client.post(
            "/api/gemini/generate-description",
            json={"script_id": "BAD", "expression": "Break a leg", "script_changed": "Final script text"},
        ).status_code
        == 400
    )


@patch("app.routers.gemini.script_doctor_service.doctor_script")
def test_doctor_script_endpoint_success_and_value_error(mock_doctor, api_client: TestClient):
    mock_doctor.return_value = {
        "script_id": "EF01",
        "expression": "Silent letters",
        "doctored_script": "Ever wonder why silent letters exist in English? Centuries ago, knights spoke them aloud!",
        "word_count": 15,
    }
    resp = api_client.post(
        "/api/gemini/doctor-script",
        json={"script_id": "EF01", "expression": "Silent letters", "original_script": "Old draft"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["script_id"] == "EF01"
    assert "knights" in resp.json()["data"]["doctored_script"]

    mock_doctor.side_effect = ValueError("Original script is empty")
    err = api_client.post(
        "/api/gemini/doctor-script",
        json={"script_id": "EF01", "expression": "Silent letters", "original_script": ""},
    )
    assert err.status_code == 400

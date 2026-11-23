"""API contract tests for /api/health and routers/sheets.py endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.routing import IdRoutingError
from app.services.sheet_service import ScriptNotFoundError, SheetService, SheetServiceError
from helpers import make_script_record

pytestmark = pytest.mark.api


def test_health_check(api_client: TestClient):
    resp = api_client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["app"] == "GoogleSheet_UI_auditor"


@patch.object(SheetService, "fetch_script_by_id")
def test_get_script_endpoint_success_and_errors(mock_fetch, api_client: TestClient):
    mock_fetch.return_value = make_script_record(
        cid="EE01",
        expression="A blessing in disguise",
        script_changed="New script",
        script_ready=False,
        short_description="Great description",
    )
    resp = api_client.get("/api/sheets/script/EE01")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"]
    assert body["data"]["ID"] == "EE01"
    assert body["data"]["expression"] == "A blessing in disguise"

    mock_fetch.side_effect = ScriptNotFoundError("EE99 not found")
    assert api_client.get("/api/sheets/script/EE99").status_code == 404

    mock_fetch.side_effect = SheetServiceError("Upstream 502")
    assert api_client.get("/api/sheets/script/EE01").status_code == 502


def test_get_script_invalid_id_format(api_client: TestClient):
    resp = api_client.get("/api/sheets/script/INVALID_ID_999")
    assert resp.status_code == 400


@patch.object(SheetService, "update_script_fields")
def test_update_script_endpoint_success_and_mismatch(mock_upd, api_client: TestClient):
    mismatch = api_client.post(
        "/api/sheets/script/EE01/update-script",
        json={"script_id": "EE02", "SCRIPT_CHANGED": "Hi", "script_ready": True, "script_date": "22/11/26"},
    )
    assert mismatch.status_code == 400

    mock_upd.return_value = {"status": "success", "id": "EE01"}
    ok = api_client.post(
        "/api/sheets/script/EE01/update-script",
        json={"script_id": "EE01", "SCRIPT_CHANGED": "Hi", "script_ready": True, "script_date": "22/11/26"},
    )
    assert ok.status_code == 200
    assert ok.json()["success"]

    mock_upd.side_effect = SheetServiceError("Failed write")
    err = api_client.post(
        "/api/sheets/script/EE01/update-script",
        json={"script_id": "EE01", "SCRIPT_CHANGED": "Hi", "script_ready": True, "script_date": "22/11/26"},
    )
    assert err.status_code == 502


@patch.object(SheetService, "update_description_field")
def test_update_description_endpoint_success_and_mismatch(mock_upd, api_client: TestClient):
    mismatch = api_client.post(
        "/api/sheets/script/EE01/update-description",
        json={"script_id": "EE02", "short_description": "Desc"},
    )
    assert mismatch.status_code == 400

    mock_upd.return_value = {"status": "success", "id": "EE01"}
    ok = api_client.post(
        "/api/sheets/script/EE01/update-description",
        json={"script_id": "EE01", "short_description": "Desc #Shorts"},
    )
    assert ok.status_code == 200
    assert ok.json()["success"]


@patch.object(SheetService, "fetch_matrix_category")
def test_get_matrix_endpoint_success_and_invalid_category(mock_matrix, api_client: TestClient):
    mock_matrix.return_value = {
        "language": "english",
        "video_type": "expression",
        "sheet_url": "https://docs.google.com/test",
        "count": 2,
        "items": [
            {"id": "EE01", "script_ready": True, "video_ready": False, "expression": "Break a leg", "script_date": "31/01/26", "has_script_changed": True},
            {"id": "EE02", "script_ready": False, "video_ready": False, "expression": "Bite the bullet", "script_date": "", "has_script_changed": False},
        ],
    }
    resp = api_client.get("/api/sheets/matrix/english/expression")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"]
    assert body["data"]["count"] == 2
    assert body["data"]["items"][0]["id"] == "EE01"

    mock_matrix.side_effect = IdRoutingError("Invalid language")
    bad_resp = api_client.get("/api/sheets/matrix/klingon/expression")
    assert bad_resp.status_code == 400


@patch.object(SheetService, "batch_update_ready_items")
def test_batch_update_ready_endpoint_success(mock_batch, api_client: TestClient):
    mock_batch.return_value = {"status": "success", "updated_count": 2, "total": 2}
    resp = api_client.post(
        "/api/sheets/matrix/batch-update-ready",
        json={
            "language": "english",
            "video_type": "expression",
            "updates": [{"id": "EE01", "script_ready": True}, {"id": "EE02", "script_ready": True}],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["updated_count"] == 2

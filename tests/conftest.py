"""
tests/conftest.py — Global test isolation guardrails and shared fixtures.

Prevents any offline test from touching live `backend/data/launch_calendar.json`
or making accidental real outbound HTTP requests via `requests`.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from typing import Iterator

import pytest
import requests
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
TESTS_DIR = ROOT_DIR / "tests"

for _p in (str(BACKEND_DIR), str(TESTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# pyrefly: ignore[missing-import]
from app.services.calendar_service import CalendarService  # noqa: E402
# pyrefly: ignore[missing-import]
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_calendar_and_network(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> Iterator[CalendarService]:
    """Isolates CalendarService storage to a temp directory and blocks unmocked `requests` HTTP calls."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        isolated_cal = CalendarService(storage_path=Path(tmp_dir) / "launch_calendar.json")
        monkeypatch.setattr("app.services.calendar_service.calendar_service", isolated_cal)
        monkeypatch.setattr("app.services.sheet_service.calendar_service", isolated_cal)
        monkeypatch.setattr("app.routers.calendar.calendar_service", isolated_cal)

        if "live_smoke" not in request.keywords:
            def _blocked_http_request(*args, **kwargs):
                raise RuntimeError(
                    "Real HTTP requests are blocked in offline tests; mock requests or _http_get/_http_post."
                )

            monkeypatch.setattr(requests.Session, "request", _blocked_http_request)

        yield isolated_cal


@pytest.fixture()
def cal_service(isolate_calendar_and_network: CalendarService) -> CalendarService:
    """Returns the isolated per-test CalendarService instance."""
    return isolate_calendar_and_network


@pytest.fixture()
def api_client() -> TestClient:
    """Returns a FastAPI TestClient wired to `main.app`."""
    return TestClient(app)

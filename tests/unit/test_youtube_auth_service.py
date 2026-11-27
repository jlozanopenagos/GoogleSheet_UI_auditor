"""Unit tests for YouTubeAuthService per-channel token isolation and validation."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.youtube_auth_service import YouTubeAuthError, YouTubeAuthService

pytestmark = pytest.mark.unit


def test_auth_status_isolation_and_disconnect(tmp_path: Path):
    secret = tmp_path / "client_secret.json"
    secret.write_text('{"web": {"client_id": "abc"}}', encoding="utf-8")

    svc = YouTubeAuthService(tokens_dir=tmp_path / "tokens", client_secret_path=secret)
    statuses = svc.get_all_statuses()
    assert statuses["client_secret_configured"] is True
    assert statuses["targets"]["english"]["connected"] is False
    assert statuses["targets"]["drive"]["connected"] is False

    # Simulate connected Spanish channel only
    svc._write_token_data("spanish", {
        "target": "spanish",
        "token": "tok_es",
        "refresh_token": "ref_es",
        "channel_id": "UC_ES_1",
        "channel_title": "Tito Español",
        "connected_at": "2026-11-27T10:00:00Z",
    })

    assert svc.get_target_status("spanish")["connected"] is True
    assert svc.get_target_status("spanish")["channel_title"] == "Tito Español"
    assert svc.get_target_status("english")["connected"] is False

    assert svc.disconnect("spanish") is True
    assert svc.get_target_status("spanish")["connected"] is False
    assert svc.disconnect("spanish") is False

    with pytest.raises(YouTubeAuthError, match="Invalid OAuth target"):
        svc.get_target_status("german")


def test_oauth_relaxes_scope_change_and_omits_incremental_scopes(tmp_path: Path, monkeypatch):
    import os
    from types import SimpleNamespace

    secret = tmp_path / "client_secret.json"
    secret.write_text('{"web": {"client_id": "abc"}}', encoding="utf-8")
    monkeypatch.delenv("OAUTHLIB_RELAX_TOKEN_SCOPE", raising=False)

    captured_auth_kwargs = {}
    observed_relax_env = {}

    class FakeFlow:
        code_verifier = "verif_123"
        credentials = SimpleNamespace(
            token="tok_en",
            refresh_token="ref_en",
            token_uri="https://oauth2.googleapis.com/token",
            client_id="abc",
            client_secret="sec",
            scopes=["https://www.googleapis.com/auth/youtube.upload"],
        )

        def authorization_url(self, **kwargs):
            captured_auth_kwargs.update(kwargs)
            return ("https://accounts.google.com/o/oauth2/auth?state=st_1", "st_1")

        def fetch_token(self, code: str):
            observed_relax_env["val"] = os.environ.get("OAUTHLIB_RELAX_TOKEN_SCOPE")
            observed_relax_env["code"] = code

    import google_auth_oauthlib.flow as flow_mod
    import googleapiclient.discovery as discovery_mod

    monkeypatch.setattr(flow_mod.Flow, "from_client_secrets_file", lambda *a, **kw: FakeFlow())

    class FakeChannels:
        def list(self, part: str, mine: bool):
            assert part == "snippet"
            assert mine is True
            return self

        def execute(self):
            return {
                "items": [
                    {
                        "id": "UC_EN_1",
                        "snippet": {
                            "title": "Lingoverse English",
                            "thumbnails": {"default": {"url": "https://img/en.jpg"}},
                        },
                    }
                ]
            }

    class FakeYouTube:
        def channels(self):
            return FakeChannels()

    monkeypatch.setattr(discovery_mod, "build", lambda *a, **kw: FakeYouTube())

    svc = YouTubeAuthService(tokens_dir=tmp_path / "tokens", client_secret_path=secret)
    start_res = svc.start_oauth_flow("english", "http://127.0.0.1:8005/api/youtube/oauth/callback")
    assert start_res["state"] == "st_1"
    assert "include_granted_scopes" not in captured_auth_kwargs

    status_res = svc.complete_oauth_callback(state="st_1", code="auth_code_1")
    assert observed_relax_env["val"] == "1"
    assert observed_relax_env["code"] == "auth_code_1"
    assert status_res["connected"] is True
    assert status_res["channel_id"] == "UC_EN_1"
    assert status_res["channel_title"] == "Lingoverse English"

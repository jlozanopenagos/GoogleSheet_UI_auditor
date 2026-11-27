"""
youtube_auth_service.py — Per-Channel YouTube & Google Drive OAuth 2.0 Manager.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..core.config import settings

logger = logging.getLogger(__name__)

VALID_TARGETS = ("english", "french", "spanish", "italian", "drive")
YOUTUBE_TARGETS = ("english", "french", "spanish", "italian")

YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
]
DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
]

DEFAULT_TOKENS_DIR = (
    Path(__file__).resolve().parent.parent.parent / "data" / "youtube_tokens"
)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class YouTubeAuthError(Exception):
    """Raised when OAuth configuration, state validation, or token refresh fails."""
    pass


class YouTubeAuthService:
    """Manages isolated OAuth 2.0 tokens for the 4 language YouTube channels and Google Drive."""

    def __init__(
        self,
        tokens_dir: Optional[Path] = None,
        client_secret_path: Optional[Path] = None,
    ):
        self.tokens_dir: Path = Path(tokens_dir) if tokens_dir else DEFAULT_TOKENS_DIR
        self._client_secret_override: Optional[Path] = (
            Path(client_secret_path) if client_secret_path else None
        )
        self._lock = threading.RLock()
        self._pending_states: Dict[str, Dict[str, Any]] = {}

    def resolve_client_secret_path(self) -> Path:
        if self._client_secret_override is not None:
            return self._client_secret_override
        raw = Path(settings.youtube_client_secret_path)
        return raw if raw.is_absolute() else (REPO_ROOT / raw).resolve()

    def has_client_secret(self) -> bool:
        return self.resolve_client_secret_path().is_file()

    @staticmethod
    def normalize_target(target: str) -> str:
        clean = str(target or "").strip().lower()
        if clean not in VALID_TARGETS:
            raise YouTubeAuthError(
                f"Invalid OAuth target '{target}'. Expected one of: {', '.join(VALID_TARGETS)}."
            )
        return clean

    @staticmethod
    def scopes_for_target(target: str) -> List[str]:
        return list(DRIVE_SCOPES if target == "drive" else YOUTUBE_SCOPES)

    def _token_path(self, target: str) -> Path:
        return self.tokens_dir / f"{target}.json"

    def _read_token_data(self, target: str) -> Optional[Dict[str, Any]]:
        path = self._token_path(target)
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    def _write_token_data(self, target: str, data: Dict[str, Any]) -> None:
        with self._lock:
            self.tokens_dir.mkdir(parents=True, exist_ok=True)
            self._token_path(target).write_text(
                json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    def get_target_status(self, target: str) -> Dict[str, Any]:
        clean = self.normalize_target(target)
        data = self._read_token_data(clean)
        if not data or not (data.get("refresh_token") or data.get("token")):
            return {
                "target": clean,
                "connected": False,
                "channel_id": "",
                "channel_title": "",
                "channel_thumbnail": "",
                "account_email": "",
                "connected_at": "",
                "has_playlist_scope": False,
            }
        scopes_set = {str(s).strip() for s in (data.get("scopes") or [])}
        has_playlist_scope = (
            False
            if clean == "drive"
            else bool(
                "https://www.googleapis.com/auth/youtube" in scopes_set
                or "https://www.googleapis.com/auth/youtube.force-ssl" in scopes_set
            )
        )
        return {
            "target": clean,
            "connected": True,
            "channel_id": str(data.get("channel_id") or ""),
            "channel_title": str(data.get("channel_title") or ""),
            "channel_thumbnail": str(data.get("channel_thumbnail") or ""),
            "account_email": str(data.get("account_email") or ""),
            "connected_at": str(data.get("connected_at") or ""),
            "has_playlist_scope": has_playlist_scope,
        }

    def get_all_statuses(self) -> Dict[str, Any]:
        return {
            "client_secret_configured": self.has_client_secret(),
            "client_secret_path": str(self.resolve_client_secret_path()),
            "targets": {t: self.get_target_status(t) for t in VALID_TARGETS},
        }

    def start_oauth_flow(self, target: str, redirect_uri: str) -> Dict[str, str]:
        clean = self.normalize_target(target)
        secret_path = self.resolve_client_secret_path()
        if not secret_path.is_file():
            raise YouTubeAuthError(
                f"OAuth credentials file not found at '{secret_path}'. "
                "Follow backend/credentials/README.md to create client_secret.json."
            )

        # pyrefly: ignore[missing-import]
        from google_auth_oauthlib.flow import Flow

        scopes = self.scopes_for_target(clean)
        flow = Flow.from_client_secrets_file(
            str(secret_path),
            scopes=scopes,
            redirect_uri=redirect_uri,
        )
        auth_url, state = flow.authorization_url(
            access_type="offline",
            prompt="select_account consent",
        )

        with self._lock:
            now = time.time()
            stale = [k for k, v in self._pending_states.items() if now - v.get("created_at", 0) > 900]
            for k in stale:
                self._pending_states.pop(k, None)
            self._pending_states[state] = {
                "target": clean,
                "scopes": scopes,
                "redirect_uri": redirect_uri,
                "code_verifier": getattr(flow, "code_verifier", None),
                "created_at": now,
            }

        return {"auth_url": auth_url, "state": state, "target": clean}

    def complete_oauth_callback(self, state: str, code: str) -> Dict[str, Any]:
        with self._lock:
            pending = self._pending_states.pop(state, None)
        if not pending:
            raise YouTubeAuthError("OAuth state is invalid or expired. Please try connecting again.")

        secret_path = self.resolve_client_secret_path()
        if not secret_path.is_file():
            raise YouTubeAuthError(f"Missing client_secret.json at '{secret_path}'.")

        # pyrefly: ignore[missing-import]
        from google_auth_oauthlib.flow import Flow
        # pyrefly: ignore[missing-import]
        from googleapiclient.discovery import build

        target = pending["target"]
        flow = Flow.from_client_secrets_file(
            str(secret_path),
            scopes=pending["scopes"],
            redirect_uri=pending["redirect_uri"],
        )
        if pending.get("code_verifier"):
            flow.code_verifier = pending["code_verifier"]
        # Google may return a superset of previously granted scopes when the same
        # owner Google account authorizes both Drive and its primary YouTube channel.
        os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
        flow.fetch_token(code=code)
        creds = flow.credentials

        channel_id = ""
        channel_title = ""
        channel_thumbnail = ""
        account_email = ""

        if target == "drive":
            drive = build("drive", "v3", credentials=creds, cache_discovery=False)
            about = drive.about().get(fields="user(emailAddress,displayName)").execute()
            user = about.get("user") or {}
            account_email = str(user.get("emailAddress") or "")
            channel_title = str(user.get("displayName") or account_email or "Google Drive")
        else:
            youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)
            resp = youtube.channels().list(part="snippet", mine=True).execute()
            items = resp.get("items") or []
            if not items:
                raise YouTubeAuthError(
                    "The selected Google account/brand does not have a YouTube channel."
                )
            ch = items[0]
            channel_id = str(ch.get("id") or "")
            snippet = ch.get("snippet") or {}
            channel_title = str(snippet.get("title") or channel_id)
            thumbs = snippet.get("thumbnails") or {}
            channel_thumbnail = str(
                (thumbs.get("default") or thumbs.get("medium") or {}).get("url") or ""
            )

        existing = self._read_token_data(target) or {}
        refresh_token = creds.refresh_token or existing.get("refresh_token") or ""

        payload = {
            "target": target,
            "token": creds.token,
            "refresh_token": refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or pending["scopes"]),
            "channel_id": channel_id,
            "channel_title": channel_title,
            "channel_thumbnail": channel_thumbnail,
            "account_email": account_email,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write_token_data(target, payload)
        return self.get_target_status(target)

    def get_credentials(self, target: str) -> Any:
        clean = self.normalize_target(target)
        data = self._read_token_data(clean)
        if not data:
            label = "Google Drive" if clean == "drive" else f"{clean.capitalize()} YouTube channel"
            raise YouTubeAuthError(
                f"{label} is not connected. Please connect it in the YouTube upload tab."
            )

        # pyrefly: ignore[missing-import]
        from google.auth.transport.requests import Request
        # pyrefly: ignore[missing-import]
        from google.oauth2.credentials import Credentials

        creds = Credentials(
            token=data.get("token"),
            refresh_token=data.get("refresh_token"),
            token_uri=data.get("token_uri") or "https://oauth2.googleapis.com/token",
            client_id=data.get("client_id"),
            client_secret=data.get("client_secret"),
            scopes=data.get("scopes") or self.scopes_for_target(clean),
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            data["token"] = creds.token
            self._write_token_data(clean, data)
        return creds

    def build_youtube_client(self, language: str) -> Any:
        clean_lang = self.normalize_target(language)
        if clean_lang == "drive":
            raise YouTubeAuthError("Use build_drive_client() for Google Drive.")
        creds = self.get_credentials(clean_lang)
        # pyrefly: ignore[missing-import]
        from googleapiclient.discovery import build
        return build("youtube", "v3", credentials=creds, cache_discovery=False)

    def build_drive_client(self) -> Any:
        creds = self.get_credentials("drive")
        # pyrefly: ignore[missing-import]
        from googleapiclient.discovery import build
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    def disconnect(self, target: str) -> bool:
        clean = self.normalize_target(target)
        with self._lock:
            path = self._token_path(clean)
            if path.is_file():
                path.unlink()
                return True
            return False


youtube_auth_service = YouTubeAuthService()

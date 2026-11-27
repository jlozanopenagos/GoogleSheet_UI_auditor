"""
config.py — Centralized Configuration & Environment Settings for GoogleSheet_UI_auditor
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict, Tuple, Optional
# pyrefly: ignore[missing-import]
from pydantic import BaseModel
# pyrefly: ignore[missing-import]
from dotenv import load_dotenv

# Load .env file from project root or parent
_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()


class Settings(BaseModel):
    # Server settings
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8005"))

    # Master Apps Script Web App Endpoint (Option A dynamic sheet router)
    master_webapp_url: str = os.getenv(
        "SHEETS_MASTER_WEBAPP_URL",
        "https://script.google.com/macros/s/AKfycbxvGvfpwoxxnqMtB9Beiq9FX2J7HCEW7bvGi_UUyqgXjX6xd8bcmM2lCCphTdluNi2CIQ/exec"
    )

    # Gemini API Settings
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    gemini_fallback_models: list[str] = [
        m.strip() for m in os.getenv(
            "GEMINI_FALLBACK_MODELS",
            "gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview,gemini-flash-lite-latest"
        ).split(",") if m.strip()
    ]
    gemini_max_output_tokens: int = int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "2500"))
    gemini_max_retries_per_model: int = int(os.getenv("GEMINI_MAX_RETRIES_PER_MODEL", "3"))

    # Request timeouts & retries
    request_timeout: int = 35
    max_retries: int = 3

    # YouTube Data API v3 & Google Drive OAuth / Asset settings
    youtube_client_secret_path: str = os.getenv("YOUTUBE_CLIENT_SECRET_PATH", "backend/credentials/client_secret.json")
    youtube_oauth_redirect_uri: str = os.getenv("YOUTUBE_OAUTH_REDIRECT_URI", "")
    google_drive_root_folder_id: str = os.getenv("GOOGLE_DRIVE_ROOT_FOLDER_ID", "")
    google_drive_root_folder_name: str = os.getenv("GOOGLE_DRIVE_ROOT_FOLDER_NAME", "_videos terminados")
    youtube_default_category_id: str = os.getenv("YOUTUBE_DEFAULT_CATEGORY_ID", "27")
    youtube_default_timezone: str = os.getenv("YOUTUBE_DEFAULT_TIMEZONE", "America/Bogota")


settings = Settings()


def _get_env_endpoint(lang: str, vtype: str) -> str:
    """Retrieve Google Sheet URL or ID from environment variables."""
    key = f"SHEETS_ENDPOINT_{lang.upper()}_{vtype.upper()}"
    return os.getenv(key, "").strip()


# In-memory mapping of (language, video_type) -> Google Sheet URL or ID
ENDPOINT_REGISTRY: Dict[Tuple[str, str], str] = {
    (lang, vtype): _get_env_endpoint(lang, vtype)
    for lang in ["english", "french", "spanish", "italian"]
    for vtype in ["expression", "game", "roleplay", "fun_facts"]
}


def extract_spreadsheet_id(url_or_id: str) -> str:
    """Extracts raw spreadsheet ID from Google Sheets URL or returns bare ID."""
    if not url_or_id:
        return ""
    clean = str(url_or_id).strip()
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", clean)
    if match:
        return match.group(1)
    if "/" not in clean and len(clean) >= 20:
        return clean
    return clean


def extract_gid(url: str) -> Optional[str]:
    """Extracts gid from Google Sheets URL if present."""
    if not url:
        return None
    match = re.search(r"[#&?]gid=([0-9]+)", url)
    return match.group(1) if match else None


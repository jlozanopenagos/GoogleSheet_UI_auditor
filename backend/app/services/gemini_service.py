"""
gemini_service.py — Direct Google Gemini REST API Client with Validation & Sanitization
"""

from __future__ import annotations

import logging
import re
from typing import Dict, Any, List
import requests

from ..core.config import settings
from ..core.routing import parse_and_route_id, ParsedId
from ..models.schemas import GeminiGenerateResponse
from .prompt_service import PromptService

logger = logging.getLogger(__name__)

# Regex pattern matching Unicode emojis
EMOJI_PATTERN = re.compile(
    r"[\U0001F600-\U0001F64F]|"  # emoticons
    r"[\U0001F300-\U0001F5FF]|"  # symbols & pictographs
    r"[\U0001F680-\U0001F6FF]|"  # transport & map symbols
    r"[\U0001F1E0-\U0001F1FF]|"  # flags (iOS)
    r"[\U00002702-\U000027B0]|"
    r"[\U000024C2-\U0001F251]|"
    r"[\U0001F900-\U0001F9FF]|"  # supplemental symbols
    r"[\U0001FA70-\U0001FAFF]",
    flags=re.UNICODE
)


class GeminiServiceError(Exception):
    """Base exception for Gemini API generation errors."""
    pass


class GeminiService:
    def __init__(self, api_key: str = "", model: str = ""):
        self.api_key = api_key or settings.gemini_api_key
        self.model = model or settings.gemini_model
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def generate_short_description(
        self,
        script_id: str,
        expression: str,
        script_changed: str
    ) -> GeminiGenerateResponse:
        """
        Generates an optimized YouTube Shorts SEO description via Gemini API.
        
        Raises:
            GeminiServiceError: If API key is missing, script is blank, or Gemini call fails.
        """
        if not self.api_key:
            raise GeminiServiceError(
                "GEMINI_API_KEY is not configured in .env. Please provide a valid Gemini API key."
            )

        if not script_changed or not script_changed.strip():
            raise GeminiServiceError(
                "Cannot generate description: Column D (SCRIPT_CHANGED) is empty! "
                "A finalized script is strictly required before generating an SEO description."
            )

        parsed: ParsedId = parse_and_route_id(script_id)
        system_prompt = PromptService.build_system_prompt(parsed.video_type, parsed.language)
        user_prompt = PromptService.build_user_prompt(
            expression=expression,
            script_changed=script_changed,
            video_type=parsed.video_type,
            language=parsed.language
        )

        # Call Gemini REST API
        endpoint = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 300
            }
        }

        try:
            resp = requests.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=settings.request_timeout
            )
        except Exception as e:
            raise GeminiServiceError(f"Network error communicating with Gemini API: {e}")

        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_json = resp.json()
                err_msg = err_json.get("error", {}).get("message", resp.text)
            except Exception:
                pass
            raise GeminiServiceError(f"Gemini API Error (HTTP {resp.status_code}): {err_msg}")

        data = resp.json()
        raw_text = self._extract_text_from_response(data)
        clean_desc = self._sanitize_description(raw_text)

        # Extract hashtags and metrics
        hashtags = re.findall(r"#\w+", clean_desc)
        words = clean_desc.split()

        return GeminiGenerateResponse(
            script_id=parsed.canonical_id,
            short_description=clean_desc,
            word_count=len(words),
            character_count=len(clean_desc),
            hashtags=hashtags
        )

    def _extract_text_from_response(self, data: Dict[str, Any]) -> str:
        candidates = data.get("candidates", [])
        if not candidates:
            raise GeminiServiceError("Gemini API returned zero candidate responses.")
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise GeminiServiceError("Gemini response contained no text parts.")
        return parts[0].get("text", "")

    def _sanitize_description(self, text: str) -> str:
        """Removes markdown code blocks, conversational prefixes, quotes, and emojis."""
        s = text.strip()
        # Remove markdown code fence ``` ... ```
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
        # Remove conversational introductory prefixes
        s = re.sub(r"^(Here is the description|Description|Short Description)[:\s-]*", "", s, flags=re.IGNORECASE)
        # Strip enclosing double quotes if model wrapped everything in quotes
        if s.startswith('"') and s.endswith('"') and len(s) > 2:
            s = s[1:-1].strip()
        # Strictly purge emojis
        s = EMOJI_PATTERN.sub("", s)
        # Clean extra spaces
        s = re.sub(r"[ \t]+", " ", s)
        s = re.sub(r"\n\s*\n", "\n", s).strip()
        return s


# Shared singleton instance
gemini_service = GeminiService()


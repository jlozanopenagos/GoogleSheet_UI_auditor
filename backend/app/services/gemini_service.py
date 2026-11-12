"""
gemini_service.py — Direct Google Gemini REST API Client with Validation, Sanitization & Auto-Retry
"""

from __future__ import annotations

import logging
import re
import time
from typing import Dict, Any, List, Tuple
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

    def validate_description_output(self, text: str, finish_reason: str = "STOP") -> Tuple[bool, str]:
        """
        Validates the generated description for completeness, narrative integrity,
        and lack of truncation.
        """
        if not text or not text.strip():
            return False, "Description is empty"

        clean = text.strip()

        # Check API finish reason
        if finish_reason == "MAX_TOKENS":
            return False, "Response was truncated by token limit (finishReason=MAX_TOKENS)"
        if finish_reason in ("SAFETY", "RECITATION", "OTHER"):
            return False, f"Response was prematurely stopped by API (finishReason={finish_reason})"

        # Check minimal length (a complete 3-beat Shorts description is at least 40 words and 180 chars)
        words = clean.split()
        if len(words) < 40:
            return False, f"Description is too short ({len(words)} words; expected >= 40 words for full 3 beats)"
        if len(clean) < 180:
            return False, f"Description is too short ({len(clean)} characters; expected >= 180 chars)"

        # Check clean ending (cannot end abruptly mid-sentence without terminal punctuation or hashtags/emojis)
        last_char = clean[-1]
        valid_terminal_chars = ('.', '!', '?', '"', "'", ')', ']', '}')
        has_terminal_punct = last_char in valid_terminal_chars
        ends_with_emoji = bool(EMOJI_PATTERN.search(clean[-4:]))
        ends_with_hashtag = bool(re.search(r"#\w+$", clean))

        if not (has_terminal_punct or ends_with_emoji or ends_with_hashtag):
            return False, f"Description appears truncated mid-sentence (ends abruptly with: '{clean[-25:]}')"

        # Check for required hashtags
        hashtags = re.findall(r"#\w+", clean)
        if len(hashtags) < 1:
            return False, "Description is missing discovery hashtags"

        return True, "Valid"

    def generate_short_description(
        self,
        script_id: str,
        expression: str,
        script_changed: str
    ) -> GeminiGenerateResponse:
        """
        Generates an optimized YouTube Shorts SEO description via Gemini API
        with auto-retry resilience and result validation.
        
        Raises:
            GeminiServiceError: If API key is missing, script is blank, or Gemini calls fail after retries.
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

        endpoint = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"
        
        max_retries = 3
        backoff_seconds = 1.0
        last_error = ""

        for attempt in range(1, max_retries + 1):
            # Dynamic temperature jitter to ensure distinct variations on retry
            current_temp = round(0.75 + ((attempt - 1) * 0.05), 2)
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
                    "temperature": current_temp,
                    "maxOutputTokens": 1000  # Generous ceiling to prevent MAX_TOKENS cutoffs
                }
            }

            try:
                resp = requests.post(
                    endpoint,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=settings.request_timeout
                )
            except requests.exceptions.RequestException as e:
                last_error = f"Network connection error: {e}"
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} failed: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                    continue
                raise GeminiServiceError(f"Network error communicating with Gemini API after {max_retries} attempts: {e}")

            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", resp.text)
                except Exception:
                    pass

                last_error = f"HTTP {resp.status_code}: {err_msg}"
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} API error: {last_error}")

                # Retry on rate limits (429) or transient server errors (500, 502, 503, 504)
                if attempt < max_retries and resp.status_code in (429, 500, 502, 503, 504):
                    time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                    continue

                raise GeminiServiceError(f"Gemini API Error (HTTP {resp.status_code}): {err_msg}")

            data = resp.json()
            try:
                raw_text, finish_reason = self._extract_text_and_finish_reason(data)
            except GeminiServiceError as e:
                last_error = str(e)
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} extraction error: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds)
                    continue
                raise

            clean_desc = self._sanitize_description(raw_text)

            # Result Checker
            is_valid, check_reason = self.validate_description_output(clean_desc, finish_reason)
            if not is_valid:
                last_error = f"Validation failed ({check_reason})"
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} invalid: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds)
                    continue
                raise GeminiServiceError(
                    f"Gemini generated invalid/incomplete description after {max_retries} attempts: {check_reason}"
                )

            # Valid complete response
            hashtags = re.findall(r"#\w+", clean_desc)
            words = clean_desc.split()

            return GeminiGenerateResponse(
                script_id=parsed.canonical_id,
                short_description=clean_desc,
                word_count=len(words),
                character_count=len(clean_desc),
                hashtags=hashtags
            )

        raise GeminiServiceError(f"Gemini generation failed after {max_retries} attempts: {last_error}")

    def _extract_text_and_finish_reason(self, data: Dict[str, Any]) -> Tuple[str, str]:
        candidates = data.get("candidates", [])
        if not candidates:
            raise GeminiServiceError("Gemini API returned zero candidate responses.")
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason", "STOP")
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise GeminiServiceError("Gemini response contained no text parts.")
        text = parts[0].get("text", "")
        return text, finish_reason

    def _extract_text_from_response(self, data: Dict[str, Any]) -> str:
        text, _ = self._extract_text_and_finish_reason(data)
        return text

    def _sanitize_description(self, text: str) -> str:
        """Removes markdown code blocks, conversational prefixes, and enclosing quotes while preserving tasteful emojis."""
        s = text.strip()
        # Remove markdown code fence ``` ... ```
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
        # Remove conversational introductory prefixes
        s = re.sub(r"^(Here is the description|Description|Short Description)[:\s-]*", "", s, flags=re.IGNORECASE)
        # Strip enclosing double quotes if model wrapped everything in quotes
        if s.startswith('"') and s.endswith('"') and len(s) > 2:
            s = s[1:-1].strip()
        # Clean extra spaces on individual lines but preserve paragraph linebreaks (\n\n)
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in s.split("\n")]
        # Normalize multiple blank lines to at most one double newline
        cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
        return cleaned


# Shared singleton instance
gemini_service = GeminiService()

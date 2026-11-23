"""
gemini_service.py — Direct Google Gemini REST API Client with Validation, Sanitization & Auto-Retry
"""

from __future__ import annotations

import logging
import re
from typing import Dict, Any, Tuple

from ..core.config import settings
from ..core.routing import parse_and_route_id, ParsedId
from ..models.schemas import GeminiGenerateResponse
from .prompt_service import PromptService
from .gemini_auditor import gemini_auditor, GeminiAuditor, GeminiAuditorError

logger = logging.getLogger(__name__)


class GeminiServiceError(GeminiAuditorError):
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
        and lack of truncation via the centralized auditor.
        """
        return gemini_auditor.audit_description(text, finish_reason)

    def generate_short_description(
        self,
        script_id: str,
        expression: str,
        script_changed: str
    ) -> GeminiGenerateResponse:
        """
        Generates an optimized YouTube Shorts SEO description via Gemini API
        routed through the GeminiAuditor for multi-model fallback, 3-attempt retry,
        token-truncation protection, and post-generation quality auditing.

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

        auditor = GeminiAuditor(
            api_key=self.api_key,
            primary_model=self.model,
            fallback_models=settings.gemini_fallback_models,
            base_url=self.base_url
        )

        try:
            clean_desc, finish_reason, used_model = auditor.execute_with_audit(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                validator_fn=self.validate_description_output,
                script_id=parsed.canonical_id,
                max_output_tokens=settings.gemini_max_output_tokens,
                max_attempts_per_model=settings.gemini_max_retries_per_model,
                timeout=settings.request_timeout
            )
        except GeminiAuditorError as e:
            raise GeminiServiceError(str(e)) from e

        hashtags = re.findall(r"#\w+", clean_desc)
        words = clean_desc.split()

        return GeminiGenerateResponse(
            script_id=parsed.canonical_id,
            short_description=clean_desc,
            word_count=len(words),
            character_count=len(clean_desc),
            hashtags=hashtags
        )

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
        """Delegates deep cleaning and artifact removal to GeminiAuditor."""
        return gemini_auditor.sanitize_output(text)


# Shared singleton instance
gemini_service = GeminiService()

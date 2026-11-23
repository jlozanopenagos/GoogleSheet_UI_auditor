"""
gemini_auditor.py — Centralized Request & Response Auditor with Dynamic Model Fallbacks & Multi-Attempt Resilience
"""

from __future__ import annotations

import logging
import re
import time
from typing import Callable, List, Optional, Tuple
import requests

from ..core.config import settings

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

# Multilingual conversational intro patterns to strip
CONVERSATIONAL_PREFIXES_REGEX = re.compile(
    r"^(?:(?:Sure!?|Okay!?|Certainly!?|Here is|Here's|Here are)\s+(?:the|your|an?|this)?\s*(?:new|audited|revised|doctored|optimized|seo|youtube shorts?)?\s*(?:description|script|draft)?[:\s-]*|"
    r"(?:Voici|Voilà)\s+(?:la|le|une|un)?\s*(?:description|script|version|texte)?[:\s-]*|"
    r"(?:Aquí|Aca)\s+(?:está|tienes|va)?\s*(?:la|el|una|un)?\s*(?:descripción|guión|guion|texto)?[:\s-]*|"
    r"(?:Ecco)\s+(?:la|il|uno|una)?\s*(?:descrizione|script|testo)?[:\s-]*|"
    r"(?:Short Description|Description|Script|Doctored Script|Doctored Version|Revised Script)[:\s-]*)",
    flags=re.IGNORECASE | re.MULTILINE
)

# Bracketed and bold section labels copied by models from prompt guidelines
SECTION_LABELS_REGEX = re.compile(
    r"^(?:\[(?:Hook|Stakes|CTA|Engagement CTA|Retention Driver|The Hook|The Stakes|Paragraph \d+|Block \d+|Challenge|Pressure|Answer Reveal|Answer|Explanation|Payoff|Setup|Discovery|Example)[^\]]*\]|"
    r"\*\*(?:Hook|Stakes|CTA|Engagement CTA|Retention Driver|The Hook|The Stakes|Paragraph \d+|Block \d+|Challenge|Pressure|Answer Reveal|Answer|Explanation|Payoff|Setup|Discovery|Example)[^*]*\*\*|"
    r"(?:Hook|Stakes|CTA|Engagement CTA|Retention Driver|The Hook|The Stakes|Paragraph \d+|Block \d+|Challenge|Pressure|Answer Reveal|Answer|Explanation|Payoff|Setup|Discovery|Example))[:\s-]*\s*",
    flags=re.IGNORECASE | re.MULTILINE
)


class GeminiAuditorError(RuntimeError):
    """Raised when Gemini generation fails all retry attempts across all available models."""
    pass


class GeminiAuditor:
    """
    Centralized Auditor and Gatekeeper for Google Gemini REST API requests and responses.
    Guarantees:
    1. Pre-request validation of payloads and parameters.
    2. Dynamic model fallback chain (cascades from primary to active backup models).
    3. At least 3 attempts per model with temperature jitter and backoff.
    4. Post-response audit validating completeness, formatting, length, and lack of truncation.
    5. Clean sanitization of markdown, conversational chatter, and prompt artifacts.
    """

    def __init__(
        self,
        api_key: str = "",
        primary_model: str = "",
        fallback_models: Optional[List[str]] = None,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta/models",
    ):
        self.api_key = (api_key or settings.gemini_api_key).strip()
        self.primary_model = (primary_model or settings.gemini_model).strip()
        self.fallback_models = fallback_models or settings.gemini_fallback_models
        self.base_url = base_url.rstrip("/")

    def get_model_chain(self) -> List[str]:
        """Returns ordered, deduplicated list of models to try."""
        chain: List[str] = []
        if self.primary_model:
            chain.append(self.primary_model)
        for m in self.fallback_models:
            m_clean = m.strip()
            if m_clean and m_clean not in chain:
                chain.append(m_clean)
        return chain or ["gemini-3.5-flash-lite"]

    def sanitize_output(self, text: str) -> str:
        """
        Deep-cleans raw Gemini text:
        - Strips markdown code blocks (```text ... ```)
        - Strips conversational headers across English, French, Spanish, Italian
        - Strips prompt bracket placeholders ([Hook], **Stakes:**, etc.)
        - Strips trailing word count markers ("Word Count: 78 words")
        - Strips outer enclosing quotes
        - Normalizes paragraph spacing (\n\n)
        """
        if not text:
            return ""

        s = text.strip()

        # 1. Remove markdown code fences
        s = re.sub(r"^```(?:[a-zA-Z0-9_-]+)?\s*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)

        # 2. Remove conversational introductory lines
        s = CONVERSATIONAL_PREFIXES_REGEX.sub("", s).strip()

        # 3. Remove accidental bracketed placeholders or markdown bold section tags
        s = SECTION_LABELS_REGEX.sub("", s).strip()

        # 4. Remove [CHALKBOARD_EXERCISE] blocks if model leaked them for game
        s = re.sub(r"\n*\[CHALKBOARD_EXERCISE\][\s\S]*$", "", s, flags=re.IGNORECASE).strip()

        # 5. Remove trailing word count labels
        s = re.sub(r"\n+(?:Word Count|Total words|Count)[:\s]*\d+.*$", "", s, flags=re.IGNORECASE).strip()

        # 6. Strip outer quotes
        if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
            if len(s) > 2:
                s = s[1:-1].strip()

        # 7. Normalize line breaks and spaces
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in s.split("\n")]
        cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
        return cleaned

    def audit_description(self, clean: str, finish_reason: str = "STOP") -> Tuple[bool, str]:
        """
        Audits YouTube Shorts SEO description for completeness, narrative integrity,
        and lack of truncation.
        """
        if not clean or not clean.strip():
            return False, "Description is empty"

        # Check API finish reason
        if finish_reason == "MAX_TOKENS":
            return False, "Response was truncated by token limit (finishReason=MAX_TOKENS)"
        if finish_reason in ("SAFETY", "RECITATION", "OTHER"):
            return False, f"Response was prematurely stopped by API (finishReason={finish_reason})"

        # Check minimal length (a complete 3-beat Shorts description is at least 35 words and 160 chars)
        words = clean.split()
        if len(words) < 35:
            return False, f"Description is too short ({len(words)} words; expected >= 35 words for full 3 beats)"
        if len(clean) < 160:
            return False, f"Description is too short ({len(clean)} characters; expected >= 160 chars)"

        # Check clean ending (cannot end abruptly mid-sentence without terminal punctuation or hashtags/emojis)
        last_char = clean[-1]
        valid_terminal_chars = ('.', '!', '?', '"', "'", ')', ']', '}')
        has_terminal_punct = last_char in valid_terminal_chars
        ends_with_emoji = bool(EMOJI_PATTERN.search(clean[-6:]))
        ends_with_hashtag = bool(re.search(r"#\w+[\s\.\!]*$", clean))

        if not (has_terminal_punct or ends_with_emoji or ends_with_hashtag):
            return False, f"Description appears truncated mid-sentence (ends abruptly with: '{clean[-25:]}')"

        # Check for required hashtags
        hashtags = re.findall(r"#\w+", clean)
        if len(hashtags) < 1:
            return False, "Description is missing discovery hashtags"

        return True, "Valid"

    def audit_script(self, clean: str, finish_reason: str = "STOP", vtype: str = "") -> Tuple[bool, str]:
        """
        Audits doctored script text for completeness, structure, and lack of truncation.
        """
        if not clean or not clean.strip():
            return False, "Script output is empty"

        if finish_reason == "MAX_TOKENS":
            return False, "Response was truncated by token limit (finishReason=MAX_TOKENS)"
        if finish_reason in ("SAFETY", "RECITATION", "OTHER"):
            return False, f"Response was prematurely stopped by API (finishReason={finish_reason})"

        words = clean.split()
        min_words = 70 if vtype == "roleplay" else 45
        if len(words) < min_words:
            return False, f"Script output is too short ({len(words)} words; expected >= {min_words})"

        # Clean terminal punctuation check
        last_char = clean[-1]
        if last_char not in ('.', '!', '?', '"', "'", ')'):
            return False, f"Script terminated abruptly mid-sentence (ends with: '{clean[-25:]}')"

        return True, "Valid"

    def execute_with_audit(
        self,
        system_prompt: str,
        user_prompt: str,
        validator_fn: Callable[[str, str], Tuple[bool, str]],
        script_id: str = "SCRIPT",
        max_output_tokens: Optional[int] = None,
        max_attempts_per_model: Optional[int] = None,
        timeout: Optional[int] = None,
    ) -> Tuple[str, str, str]:
        """
        Executes Gemini generation with multi-model fallback and at least 3 attempts per model.
        Returns: (sanitized_and_audited_text, finish_reason, successful_model_name)
        """
        if not self.api_key:
            raise GeminiAuditorError(
                "GEMINI_API_KEY is not configured in .env. Please provide a valid Gemini API key."
            )

        tokens_cap = max_output_tokens or settings.gemini_max_output_tokens
        attempts_limit = max_attempts_per_model or settings.gemini_max_retries_per_model
        req_timeout = timeout or settings.request_timeout

        models_chain = self.get_model_chain()
        diagnostic_log: List[str] = []

        for model_idx, cur_model in enumerate(models_chain, start=1):
            endpoint = f"{self.base_url}/{cur_model}:generateContent?key={self.api_key}"

            for attempt in range(1, attempts_limit + 1):
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
                        "maxOutputTokens": tokens_cap
                    }
                }

                logger.info(
                    "[%s] Gemini request: model '%s' (%d/%d), attempt %d/%d (temp=%.2f, maxTokens=%d)...",
                    script_id, cur_model, model_idx, len(models_chain), attempt, attempts_limit, current_temp, tokens_cap
                )

                try:
                    resp = requests.post(
                        endpoint,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=req_timeout
                    )
                except requests.exceptions.RequestException as exc:
                    err_msg = f"Network exception: {exc}"
                    diagnostic_log.append(f"[{cur_model} attempt {attempt}] {err_msg}")
                    logger.warning("[%s] Network error on %s attempt %d: %s", script_id, cur_model, attempt, exc)
                    if attempt < attempts_limit:
                        time.sleep(1.0 * (2 ** (attempt - 1)))
                        continue
                    # On final attempt of this model, try next model
                    break

                # Handle HTTP errors
                if resp.status_code != 200:
                    err_detail = resp.text[:300]
                    try:
                        err_detail = resp.json().get("error", {}).get("message", err_detail)
                    except Exception:
                        pass

                    diagnostic_log.append(f"[{cur_model} attempt {attempt}] HTTP {resp.status_code}: {err_detail}")
                    logger.warning(
                        "[%s] API error on %s attempt %d (HTTP %d): %s",
                        script_id, cur_model, attempt, resp.status_code, err_detail
                    )

                    # 404 (model deprecated/unavailable) or 429 (quota exhausted) -> Break immediately to next model!
                    if resp.status_code in (404, 429):
                        logger.warning(
                            "[%s] Model '%s' returned HTTP %d. Immediately rotating to next backup model...",
                            script_id, cur_model, resp.status_code
                        )
                        break

                    # Transient server errors (500, 502, 503, 504) -> retry or rotate
                    if resp.status_code in (500, 502, 503, 504) and attempt < attempts_limit:
                        time.sleep(1.5 * attempt)
                        continue
                    break

                # Parse JSON body
                try:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise ValueError("Gemini returned zero candidate responses.")
                    cand = candidates[0]
                    finish_reason = cand.get("finishReason", "STOP")
                    parts = cand.get("content", {}).get("parts", [])
                    if not parts or "text" not in parts[0]:
                        raise ValueError("Gemini response contained no text parts.")
                    raw_text = parts[0]["text"]
                except Exception as parse_exc:
                    diagnostic_log.append(f"[{cur_model} attempt {attempt}] Parse error: {parse_exc}")
                    logger.warning("[%s] Failed parsing Gemini response (%s): %s", script_id, cur_model, parse_exc)
                    if attempt < attempts_limit:
                        time.sleep(1.0)
                        continue
                    break

                # Sanitize text
                clean_text = self.sanitize_output(raw_text)

                # Auditor Quality Gate Check
                is_valid, check_reason = validator_fn(clean_text, finish_reason)
                if not is_valid:
                    diagnostic_log.append(f"[{cur_model} attempt {attempt}] Audit rejection: {check_reason}")
                    logger.warning(
                        "[%s] Attempt %d/%d on '%s' failed auditor quality gate: %s. Retrying...",
                        script_id, attempt, attempts_limit, cur_model, check_reason
                    )
                    if attempt < attempts_limit:
                        time.sleep(1.0)
                        continue
                    # Model exhausted attempts with invalid output -> try next fallback model
                    break

                # Success!
                logger.info(
                    "[%s] Successfully generated and audited content with model '%s' (attempt %d).",
                    script_id, cur_model, attempt
                )
                return clean_text, finish_reason, cur_model

        # If all models and attempts were exhausted
        summary_errors = "; ".join(diagnostic_log[-4:]) if diagnostic_log else "No response received"
        raise GeminiAuditorError(
            f"Gemini generation failed after trying {len(models_chain)} models ({', '.join(models_chain)}). "
            f"Recent diagnostics: {summary_errors}"
        )


# Global singleton instance
gemini_auditor = GeminiAuditor()

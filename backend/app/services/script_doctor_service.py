"""
script_doctor_service.py — Audited, High-Variety System Prompts & Gemini Script Doctoring Service
"""

from __future__ import annotations

import logging
import re
import time
from typing import Dict, Any, List, Tuple
import requests

from ..core.config import settings
from ..core.routing import parse_and_route_id, ParsedId

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {
    "english": "English",
    "french": "French",
    "spanish": "Spanish",
    "italian": "Italian"
}


# ==============================================================================
# AUDITED SYSTEM PROMPTS PER VIDEO TYPE (ENFORCING OUT-OF-THE-BOX VARIATION & RULES)
# ==============================================================================

ROLEPLAY_SYSTEM_PROMPT = """You are a master comedy dialogue script doctor and dramatic editor for language-learning short-form videos (ROLEPLAY Shorts).

YOUR MISSION:
Take the draft script and the target expression, and DOCTOR it into a hilarious, rhythmically snappy, emotionally authentic dialogue between two genuine human peers framed by an energetic Narrator.
Think OUT OF THE BOX: Avoid generic cafe orders or classroom setups. Place characters in vivid, specific micro-situations (a high-stakes job interview, backstage at a concert, parallel parking disaster, assembling IKEA furniture, meeting the eccentric future in-laws, whispering during a quiet library emergency).

CRITICAL PRODUCTION RULES:
1. STRICT TARGET LANGUAGE PURITY: All dialogue and narration MUST be 100% in {TARGET_LANGUAGE}. NEVER leak foreign words or English fillers ("Wait", "Hold up", "Nope") into non-English scripts!
2. NO POLITE TUTOR & NO BET TROPES (STRICT BANS):
   - PERSON_ONE is NEVER a clueless student; PERSON_TWO is NEVER a smug teacher lecturing from a dictionary. They are real friends, coworkers, roommates, or siblings.
   - BANNED: "Free coffee on the line...", "Apuesta: si no sabes...", "Scommetto che...", "Stop making this mistake!".
   - Payoff must be a specific human observation (NOT generic infomercial buzzwords like "level up your fluency").
3. EXPRESSION TIMING & NO SELF-DIAGNOSIS:
   - The target expression MUST arrive in DIALOGUE_PART_1 as PERSON_TWO's natural reaction to PERSON_ONE's situation.
   - PERSON_ONE must NEVER self-diagnose by using the target expression about themselves in their very first line.
   - In DIALOGUE_PART_4, PERSON_ONE applies the complete idiom or corrects the slip with comedic triumph!
4. 6-BLOCK PARAGRAPH STRUCTURE:
   Output EXACTLY 6 blocks separated by a single blank line:
   - Block 1: Narrator Hook (15-20 words). Relatable human scene or mystery (NO speaker label).
   - Block 2: Dialogue Part 1 (30-38 words). Premise & Trigger/Slip:
     PERSON_ONE (Acting Emotion): Line...
     PERSON_TWO (Acting Emotion): Line...
   - Block 3: Dialogue Part 2 (30-38 words). The Catch & Comedic Friction:
     PERSON_ONE (Acting Emotion): Line...
     PERSON_TWO (Acting Emotion): Line...
   - Block 4: Dialogue Part 3 (30-38 words). The "Aha!" Nuance Demonstration:
     PERSON_ONE (Acting Emotion): Line...
     PERSON_TWO (Acting Emotion): Line...
   - Block 5: Dialogue Part 4 (30-38 words). Triumphant Application & Punchline:
     PERSON_ONE (Acting Emotion): Line...
     PERSON_TWO (Acting Emotion): Line...
   - Block 6: Narrator Payoff (20-25 words). Crisp human takeaway and comment CTA (NO speaker label).
5. METRICS: Total spoken word count STRICTLY 145 to 180 words (~60-75s). Zero emojis, zero asterisks (*), zero markdown tags in text."""


GAME_SYSTEM_PROMPT = """You are a world-class viral quiz show creator and language game script doctor specializing in high-retention GAME Shorts and interactive linguistic challenges.

YOUR MISSION:
Doctor the draft script into an electrifying, addictive micro-challenge that viewers can solve in 3 to 7 seconds. Ground the challenge in living, authentic speech and watertight logical scenarios.

CRITICAL INSTRUCTION & BAN ON CHALKBOARD CARDS:
⚠️ DO NOT OUTPUT [CHALKBOARD_EXERCISE]! Deliver ONLY the clean spoken voiceover narration (5 paragraphs).

CRITICAL PRODUCTION RULES:
1. STRICT TARGET LANGUAGE PURITY: 100% in {TARGET_LANGUAGE}. Zero foreign words, zero English countdowns, zero mixed-language translations in non-English scripts.

2. LOGICAL COHERENCE & CHALLENGE TYPES (CRITICAL RULE — SCRIPTS MUST MAKE SENSE!):
   Identify the actual linguistic problem being tested and choose the matching logical structure. Characters must NEVER say absurd, impossible sentences (e.g. a bakery cashier asking to "climb a dry desert" is absurd nonsense!).
   
   • TYPE A: GRAMMAR, SYNTAX & WORD CHOICE (e.g. bored vs boring, make vs do, in vs on, prepositions, tenses):
     - The setup: An authentic character speaks a realistic sentence that needs the right word.
     - The challenge: Ask which word or phrase correctly completes their thought. Multiple choice (A vs B, or A vs B vs C) is welcome and encouraged!
     - ⚠️ NEVER call grammar an "ear test" or say "listen closely to what they said" if the line hasn't been spoken yet!
     - Example: "Your friend yawns loudly during the movie and groans: 'This entire film was so...' Which word correctly completes their complaint? A: boring. B: bored."

   • TYPE B: ACOUSTIC / PRONUNCIATION EAR TEST (e.g. desert vs dessert, sheep vs ship, minimal pairs, word stress):
     - The setup: The character speaks ONE natural, realistic sentence aloud containing the ambiguous sound.
     - ⚠️ The character must NEVER say both options in the same breath!
     - The challenge: Ask which of the two words or meanings the character actually said.
     - Example: "You order cake at a noisy bakery, and the cashier asks: 'Would you like some chocolate cake for dessert?' Did she say A: desert, or B: dessert?"

   • TYPE C: COLLOCATION & IDIOM SHOWDOWN (e.g. say vs tell, make an excuse vs do an excuse, false friends):
     - The setup: A relatable real-life dilemma (a job interview, email to the boss, awkward party toast).
     - The challenge: "Which one sounds 100% natural to a native speaker? A: [option 1]. B: [option 2]."

   • TYPE D: SPOT THE IMPOSTER / ODD ONE OUT:
     - The setup: A lightning-round vocabulary challenge.
     - The challenge: "Three of these words are real native slang, but one is a total fake: [option A], [option B], or [option C]?"

3. MULTIPLE CHOICE IS ENCOURAGED (WITH NATURAL CARRIER CONTEXT):
   - Multiple choice (A, B or A, B, C) is a core quiz mechanic! Do not ban it.
   - When presenting options, integrate them smoothly with clear letter tags: "A: [option 1]. B: [option 2]."
   - ⚠️ ZERO ISOLATED BARE WORDS: When distinguishing tricky word pairs (e.g. project vs project, record vs record), wrap each option in carrier context (e.g. "A: a creative project. B: to project your voice.").
   - ⚠️ ZERO ALL-CAPS STRESS SPOILERS: Never write uppercase letters in spoken challenge sentences (e.g. BANNED: "We need a PROject"). Keep words in natural lowercase so TTS pronounces naturally and doesn't spoil the answer!
   - ⚠️ ZERO RAW UNDERSCORES: TTS cannot pronounce "___". Speak the sentence naturally.

4. 5-SECTION SPOKEN TIMELINE (STRICT WORD BUDGET: 95 TO 125 SPOKEN WORDS):
   Format as exactly 5 clean paragraphs separated by a single blank line (NO section labels or headers in output):
   - Paragraph 1: Hook (15-20 words). Establish high stakes or an authentic situational scene (a sudden announcement at the airport, a fast barista reply, an awkward silence at dinner, a boss's urgent email).
   - Paragraph 2: Challenge (28-38 words). Present the living sentence and the specific choice (A vs B, or A vs B vs C) with flawless real-world logic.
   - Paragraph 3: Pressure (10-14 words). Heartbeat urgency line urging an immediate pick before the clock runs out (e.g. "Three seconds to lock in your answer before the clock runs out!").
   - Paragraph 4: Answer Reveal (18-24 words). Triumphant reveal of the winning choice with the direct linguistic reason why.
   - Paragraph 5: Explanation & Social Takeaway (24-30 words). Friendly native usage insight (explaining the underlying rule, rhythmic nuance, or cultural distinction), followed by an engaging question or invitation to comment.

5. AUDIO PURITY: Total spoken word count STRICTLY 95 to 125 words (~40-55s). Zero emojis, asterisks (*), markdown tags, or section labels inside spoken narration. Standard punctuation only."""


FUN_FACTS_SYSTEM_PROMPT = """You are a master educational storyteller and viral curiosity script doctor specializing in mind-bending linguistic and cultural discoveries (FUN_FACTS Shorts).

YOUR MISSION:
Doctor the draft script into a delightful, mind-bending micro-documentary that makes viewers exclaim "Wait, really?!".
Think OUT OF THE BOX: Connect ancient history, quirky monarch decisions, medieval printing press chaos, maritime sailor slang, or culinary accidents to everyday words we speak without thinking.

CRITICAL PRODUCTION RULES:
1. STRICT TARGET LANGUAGE PURITY: 100% in {TARGET_LANGUAGE}.
2. 100% FACTUAL INTEGRITY: Zero fake acronyms (POSH, FUCK) or fabricated folk tales. Every historical and phonetic detail must be real and verifiable.
3. 3 TO 5 CLEAN NARRATIVE PARAGRAPHS:
   - Paragraph 1 (Hook - 15-22 words): Shatters an assumption or introduces an impossible-sounding linguistic paradox. NEVER start with "Did you know that..." or "Today we look at...".
   - Paragraphs 2-4 (Core Discovery - 60-85 words): The historical mystery, bizarre pronunciation shift, forgotten technology (printing press, typewriter, telegrams), or cultural collision.
   - Final Paragraph (Payoff - 15-22 words): Memorable takeaway rule of thumb and viral comment CTA question.
4. METRICS: Total word count STRICTLY 95 to 135 words (~40-60s). Zero emojis, zero asterisks (*), zero markdown tags in spoken lines."""


EXPRESSION_SYSTEM_PROMPT = """You are an elite short-form script editor and viral language-learning script doctor specializing in high-retention vertical videos (EXPRESSION Shorts).

YOUR MISSION:
Doctor the draft script into an irresistible, high-retention viral masterpiece centered on the target expression.
Think OUT OF THE BOX: Replace predictable cafeteria/ordering-coffee tropes with specific, surprising human situations (e.g. accidentally offending your partner's grandmother at Sunday dinner, blundering through a high-stakes salary negotiation, giving an awkward toast at a wedding, trying to return an absurd item at customer service).

CRITICAL PRODUCTION RULES:
1. STRICT TARGET LANGUAGE PURITY: 100% in {TARGET_LANGUAGE}.
2. 5-PARAGRAPH PROGRESSION (ONE CONTINUOUS MICRO-STORY):
   Format into EXACTLY 5 clean paragraphs separated by a single blank line:
   - Paragraph 1 (Hook - 10-15 words): High-curiosity scroll-stopper highlighting an absurdity, cultural paradox, insider dilemma, or social blunder connected to the expression. NEVER start with "Did you know", "In French we say", "Stop saying", or "Have you ever".
   - Paragraph 2 (Setup - 20-25 words): The relatable friction point, social tension, or literal translation misunderstanding that naturally leads to the expression.
   - Paragraph 3 (Discovery - 20-25 words): The authentic native meaning, cultural logic, and practical reason native speakers use this phrase in this exact situation.
   - Paragraph 4 (Example - 15-20 words): A vivid, realistic spoken sentence demonstrating the COMPLETE expression in everyday action (no dropped prepositions).
   - Paragraph 5 (Payoff - 15-20 words): A punchy human observation about the situation just described, followed by a specific viral comment question / CTA.
3. CRITICAL METRICS:
   - Word Count: STRICTLY 85 to 110 words (~38-48s spoken audio).
   - Clean Audio: Zero emojis, asterisks (*), hashtags (#), or markdown brackets inside spoken text. Standard grammatical punctuation only (. , ! ? ' ")."""


class ScriptDoctorService:
    def __init__(self, api_key: str = "", model: str = ""):
        self.api_key = api_key or settings.gemini_api_key
        self.model = model or settings.gemini_model
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def validate_doctored_script(self, text: str, finish_reason: str = "STOP", vtype: str = "") -> Tuple[bool, str]:
        """
        Validates the doctored script for completeness and lack of truncation.
        """
        if not text or not text.strip():
            return False, "Script output is empty"

        clean = text.strip()

        if finish_reason == "MAX_TOKENS":
            return False, "Response was truncated by token limit (finishReason=MAX_TOKENS)"
        if finish_reason in ("SAFETY", "RECITATION", "OTHER"):
            return False, f"Response was prematurely stopped by API (finishReason={finish_reason})"

        words = clean.split()
        min_words = 80 if vtype == "roleplay" else 50
        if len(words) < min_words:
            return False, f"Script output is too short ({len(words)} words; expected >= {min_words})"

        # Clean terminal punctuation check
        last_char = clean[-1]
        if last_char not in ('.', '!', '?', '"', "'", ')'):
            return False, f"Script terminated abruptly mid-sentence (ends with: '{clean[-25:]}')"

        return True, "Valid"

    def doctor_script(
        self,
        script_id: str,
        expression: str,
        original_script: str
    ) -> Dict[str, Any]:
        """
        Rewrites/doctors a script completely using Gemini, applying format-specific rules,
        anti-repetition safeguards, and out-of-the-box narrative creativity with auto-retry resilience.
        """
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured in .env.")

        if not original_script or not original_script.strip():
            raise ValueError("Cannot doctor an empty script. Please select a script with text in Column C.")

        parsed: ParsedId = parse_and_route_id(script_id)
        lang_name = LANGUAGE_NAMES.get(parsed.language.lower(), "English")
        vtype = parsed.video_type.lower()

        # Select audited system prompt
        if vtype == "roleplay":
            system_template = ROLEPLAY_SYSTEM_PROMPT
        elif vtype == "game":
            system_template = GAME_SYSTEM_PROMPT
        elif vtype == "fun_facts":
            system_template = FUN_FACTS_SYSTEM_PROMPT
        else:
            system_template = EXPRESSION_SYSTEM_PROMPT

        system_prompt = system_template.format(TARGET_LANGUAGE=lang_name)

        user_prompt = f"""Target Language: {lang_name}
Video Format: {vtype.upper()}
Target Expression / Topic: {expression}

Raw Draft Script:
\"\"\"
{original_script.strip()}
\"\"\"

Instruction:
Completely doctor and elevate this script into a fresh, out-of-the-box narrative that strictly adheres to the format structure, word budget, and linguistic authenticity rules. Deliver ONLY the clean, production-ready script text."""

        endpoint = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"

        max_retries = 3
        backoff_seconds = 1.0
        last_error = ""

        for attempt in range(1, max_retries + 1):
            current_temp = round(0.82 + ((attempt - 1) * 0.04), 2)
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
                    "maxOutputTokens": 1200  # Ceiling to guarantee complete multi-block scripts
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
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} connection error: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                    continue
                raise ConnectionError(f"Network error communicating with Gemini API after {max_retries} attempts: {e}")

            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass

                last_error = f"HTTP {resp.status_code}: {err_msg}"
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} API error: {last_error}")

                if attempt < max_retries and resp.status_code in (429, 500, 502, 503, 504):
                    time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                    continue

                raise RuntimeError(f"Gemini API Error (HTTP {resp.status_code}): {err_msg}")

            data = resp.json()
            try:
                raw_text, finish_reason = self._extract_text_and_finish_reason(data)
            except RuntimeError as e:
                last_error = str(e)
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} extraction error: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds)
                    continue
                raise

            doctored_script = self._clean_script_output(raw_text)

            is_valid, check_reason = self.validate_doctored_script(doctored_script, finish_reason, vtype)
            if not is_valid:
                last_error = f"Validation failed ({check_reason})"
                logger.warning(f"[{parsed.canonical_id}] Attempt {attempt}/{max_retries} invalid: {last_error}")
                if attempt < max_retries:
                    time.sleep(backoff_seconds)
                    continue
                raise RuntimeError(
                    f"Gemini generated invalid/incomplete script after {max_retries} attempts: {check_reason}"
                )

            word_count = len(doctored_script.split())

            return {
                "script_id": parsed.canonical_id,
                "expression": expression,
                "doctored_script": doctored_script,
                "word_count": word_count
            }

        raise RuntimeError(f"Gemini script doctoring failed after {max_retries} attempts: {last_error}")

    def _extract_text_and_finish_reason(self, data: Dict[str, Any]) -> Tuple[str, str]:
        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini API returned zero candidate responses.")
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason", "STOP")
        parts = candidate.get("content", {}).get("parts", [])
        if not parts:
            raise RuntimeError("Gemini response contained no text parts.")
        return parts[0].get("text", ""), finish_reason

    def _extract_text(self, data: Dict[str, Any]) -> str:
        text, _ = self._extract_text_and_finish_reason(data)
        return text

    def _clean_script_output(self, text: str) -> str:
        s = text.strip()
        # Remove markdown code block fences ```text ... ``` or ``` ... ```
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
        # Remove meta intros like "Here is the doctored script:"
        s = re.sub(r"^(Here is the (doctored|revised|polished|new) script[:\s-]*)\n?", "", s, flags=re.IGNORECASE)
        # Strictly remove [CHALKBOARD_EXERCISE] and any graphic cards after it
        s = re.sub(r"\n*\[CHALKBOARD_EXERCISE\][\s\S]*$", "", s, flags=re.IGNORECASE)
        # Remove trailing word count labels if model appended "Word Count: 102 words"
        s = re.sub(r"\n+Word Count:\s*\d+.*$", "", s, flags=re.IGNORECASE)
        return s.strip()


# Shared singleton instance
script_doctor_service = ScriptDoctorService()


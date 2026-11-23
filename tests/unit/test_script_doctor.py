"""Unit tests for ScriptDoctorService prompt rules, cleaning, validation, and retries."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.script_doctor_service import (
    EXPRESSION_SYSTEM_PROMPT,
    FUN_FACTS_SYSTEM_PROMPT,
    GAME_SYSTEM_PROMPT,
    ROLEPLAY_SYSTEM_PROMPT,
    ScriptDoctorService,
)
from helpers import make_gemini_ok_response

pytestmark = pytest.mark.unit


def test_clean_script_output():
    service = ScriptDoctorService(api_key="mock_key")
    raw = (
        "```text\nHere is the doctored script:\nThis is the actual script content.\n\n"
        "[CHALKBOARD_EXERCISE]\nLine 1: Test ___\nLine 2: A) Option A\nWord Count: 7 words\n```"
    )
    assert service._clean_script_output(raw) == "This is the actual script content."


def test_empty_script_raises_error():
    service = ScriptDoctorService(api_key="mock_key")
    with pytest.raises(ValueError):
        service.doctor_script("EF01", "Silent letters", "")


def test_system_prompt_rules_enforcement():
    assert "NO POLITE TUTOR" in ROLEPLAY_SYSTEM_PROMPT
    assert "6-BLOCK PARAGRAPH STRUCTURE" in ROLEPLAY_SYSTEM_PROMPT
    assert "145 to 180 words" in ROLEPLAY_SYSTEM_PROMPT

    assert "DO NOT OUTPUT [CHALKBOARD_EXERCISE]" in GAME_SYSTEM_PROMPT
    assert "LOGICAL COHERENCE & CHALLENGE TYPES" in GAME_SYSTEM_PROMPT
    assert "MULTIPLE CHOICE IS ENCOURAGED" in GAME_SYSTEM_PROMPT
    assert "ZERO ISOLATED BARE WORDS" in GAME_SYSTEM_PROMPT
    assert "95 to 125 words" in GAME_SYSTEM_PROMPT

    assert "100% FACTUAL INTEGRITY" in FUN_FACTS_SYSTEM_PROMPT
    assert "3 TO 5 CLEAN NARRATIVE PARAGRAPHS" in FUN_FACTS_SYSTEM_PROMPT

    assert "5-PARAGRAPH PROGRESSION" in EXPRESSION_SYSTEM_PROMPT
    assert "85 to 110 words" in EXPRESSION_SYSTEM_PROMPT


def test_validate_doctored_script_states():
    service = ScriptDoctorService(api_key="mock_key")
    valid_script = (
        "Narrator (energetic): You thought asking for a glass of tap water in Paris was easy.\n\n"
        "PERSON_ONE (hesitant): Excusez-moi, est-ce que je peux avoir de l'eau s'il vous plaît?\n"
        "PERSON_TWO (smirking): De l'eau en bouteille à dix euros ou une carafe gratuite?\n\n"
        "PERSON_ONE (shocked): Attends, il y a un mot magique pour ne pas payer dix euros?\n"
        "PERSON_TWO (confident): Une carafe d'eau. C'est la loi, c'est gratuit et c'est parfait.\n\n"
        "PERSON_ONE (relieved): Une carafe d'eau fraîche, s'il vous plaît!\n"
        "PERSON_TWO (approving): Voilà, maintenant tu commandes comme un vrai Parisien!\n\n"
        "Narrator: Never pay tourist prices for tap water again. Drop your best French travel tip below!"
    )
    is_valid, reason = service.validate_doctored_script(valid_script, finish_reason="STOP", vtype="roleplay")
    assert is_valid
    assert reason == "Valid"

    is_trunc, trunc_reason = service.validate_doctored_script("Some script", finish_reason="MAX_TOKENS", vtype="game")
    assert not is_trunc
    assert "MAX_TOKENS" in trunc_reason

    abrupt_script = valid_script.rstrip("!")  # remove terminal sentence punctuation
    # Truncate before last line ending cleanly
    abrupt_only = "\n".join(valid_script.splitlines()[:-2]) + "\nPERSON_TWO (approving): Voilà, maintenant tu commandes comme un vrai Parisien"
    is_abrupt, abrupt_reason = service.validate_doctored_script(abrupt_only, finish_reason="STOP", vtype="roleplay")
    assert not is_abrupt
    assert "abruptly mid-sentence" in abrupt_reason
    assert len(abrupt_script) > 0


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_doctor_script_retry_and_sanitize_success(mock_post, mock_sleep):
    service = ScriptDoctorService(api_key="mock_key", model="gemini-3.5-flash-lite")
    raw_script_output = (
        "```text\n"
        "Here is the doctored script:\n"
        "**Paragraph 1 (Hook):** You thought asking for a glass of tap water in Paris was easy.\n\n"
        "PERSON_ONE (hesitant): Excusez-moi, est-ce que je peux avoir de l'eau s'il vous plaît?\n"
        "PERSON_TWO (smirking): De l'eau en bouteille à dix euros ou une carafe gratuite?\n\n"
        "PERSON_ONE (shocked): Attends, il y a un mot magique pour ne pas payer dix euros?\n"
        "PERSON_TWO (confident): Une carafe d'eau. C'est la loi, c'est gratuit et c'est parfait.\n\n"
        "PERSON_ONE (relieved): Une carafe d'eau fraîche, s'il vous plaît!\n"
        "PERSON_TWO (approving): Voilà, maintenant tu commandes comme un vrai Parisien!\n\n"
        "Narrator: Never pay tourist prices for tap water again. Drop your best French travel tip below!\n"
        "Word Count: 105 words\n"
        "```"
    )
    mock_post.return_value = make_gemini_ok_response(raw_script_output)

    result = service.doctor_script(
        script_id="FR01",
        expression="Carafe d'eau",
        original_script="Draft about water in Paris",
    )
    assert result["script_id"] == "FR01"
    assert "```" not in result["doctored_script"]
    assert "Here is the doctored script:" not in result["doctored_script"]
    assert "**Paragraph 1 (Hook):**" not in result["doctored_script"]
    assert "Word Count:" not in result["doctored_script"]
    assert "PERSON_ONE" in result["doctored_script"]
    assert result["word_count"] > 70

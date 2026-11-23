"""Unit tests for GeminiAuditor sanitization, audit gates, model cascade, and retries."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.gemini_auditor import GeminiAuditor, GeminiAuditorError
from helpers import make_gemini_ok_response, make_valid_description

pytestmark = pytest.mark.unit


def test_get_model_chain_deduplication():
    auditor = GeminiAuditor(
        api_key="mock_key",
        primary_model="gemini-3.5-flash-lite",
        fallback_models=["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
    )
    assert auditor.get_model_chain() == [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Here is the description:\nActual text.", "Actual text."),
        ("Voici la description :\nTexte réel.", "Texte réel."),
        ("Voilà la version :\nTexte réel.", "Texte réel."),
        ("Aquí está la descripción:\nTexto real.", "Texto real."),
        ("Ecco la descrizione:\nTesto reale.", "Testo reale."),
    ],
)
def test_sanitize_output_multilingual_intros(raw: str, expected: str):
    auditor = GeminiAuditor(api_key="mock_key")
    assert auditor.sanitize_output(raw) == expected


def test_sanitize_output_bracketed_and_bold_labels():
    auditor = GeminiAuditor(api_key="mock_key")
    raw = (
        "[Hook] You thought asking for water in Paris was easy.\n\n"
        "**Challenge:** Which phrase is authentic?\n\n"
        "**Pressure:** Three seconds to lock in your answer!\n\n"
        "[Paragraph 4 - Answer Reveal] Option A is correct.\n\n"
        "**Explanation & Social Takeaway:** Never pay tourist prices again."
    )
    cleaned = auditor.sanitize_output(raw)
    assert "[Hook]" not in cleaned
    assert "**Challenge:**" not in cleaned
    assert "**Pressure:**" not in cleaned
    assert "[Paragraph 4 - Answer Reveal]" not in cleaned
    assert "**Explanation & Social Takeaway:**" not in cleaned
    assert "You thought asking for water" in cleaned
    assert "Which phrase is authentic?" in cleaned


def test_sanitize_output_code_fences_and_word_counts():
    auditor = GeminiAuditor(api_key="mock_key")
    raw = "```markdown\nThis is the real script line.\n\nWord Count: 42 words\n```"
    assert auditor.sanitize_output(raw) == "This is the real script line."


def test_audit_description_valid_and_rejections():
    auditor = GeminiAuditor(api_key="mock_key")
    is_valid, reason = auditor.audit_description(make_valid_description(), finish_reason="STOP")
    assert is_valid
    assert reason == "Valid"

    is_trunc, trunc_reason = auditor.audit_description("Some text...", finish_reason="MAX_TOKENS")
    assert not is_trunc
    assert "MAX_TOKENS" in trunc_reason

    no_tags = (
        "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
        "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
        "the subtle acoustic double-consonant secret native Italians use to get it right every single time."
    )
    is_tag_ok, tag_reason = auditor.audit_description(no_tags, finish_reason="STOP")
    assert not is_tag_ok
    assert "missing discovery hashtags" in tag_reason


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_primary_model_404_cascades_to_fallback(mock_post, mock_sleep):
    auditor = GeminiAuditor(
        api_key="mock_key",
        primary_model="gemini-2.5-flash",
        fallback_models=["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
    )
    mock_404 = MagicMock(status_code=404, text='{"error":{"message":"Model not found"}}')
    mock_404.json.return_value = {"error": {"message": "Model not found"}}
    mock_post.side_effect = [mock_404, make_gemini_ok_response(make_valid_description())]

    clean_text, finish_reason, model_used = auditor.execute_with_audit(
        system_prompt="system",
        user_prompt="user",
        validator_fn=auditor.audit_description,
        script_id="IE01",
    )
    assert model_used == "gemini-3.5-flash-lite"
    assert "#LearnItalian" in clean_text
    assert finish_reason == "STOP"
    assert mock_post.call_count == 2


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_multi_attempt_retry_loop_on_invalid_output(mock_post, mock_sleep):
    auditor = GeminiAuditor(
        api_key="mock_key",
        primary_model="gemini-2.5-flash",
        fallback_models=["gemini-3.5-flash-lite"],
    )
    bad_resp = make_gemini_ok_response("You order espresso at a bustling Milan cafe without any hashtags.")
    ok_resp = make_gemini_ok_response(make_valid_description())
    mock_post.side_effect = [bad_resp, ok_resp]

    clean_text, _, model_used = auditor.execute_with_audit(
        system_prompt="system",
        user_prompt="user",
        validator_fn=auditor.audit_description,
        script_id="IE01",
    )
    assert model_used == "gemini-2.5-flash"
    assert "#LearnItalian" in clean_text


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_all_models_fail_raises_gemini_auditor_error(mock_post, mock_sleep):
    auditor = GeminiAuditor(
        api_key="mock_key",
        primary_model="gemini-2.5-flash",
        fallback_models=["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
    )
    mock_404 = MagicMock(status_code=404, text='{"error":{"message":"Model not found"}}')
    mock_404.json.return_value = {"error": {"message": "Model not found"}}
    mock_post.side_effect = [mock_404, mock_404, mock_404]

    with pytest.raises(GeminiAuditorError):
        auditor.execute_with_audit(
            system_prompt="system",
            user_prompt="user",
            validator_fn=auditor.audit_description,
            script_id="IE01",
        )

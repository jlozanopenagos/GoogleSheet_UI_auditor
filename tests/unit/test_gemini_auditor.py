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
        ("Title: The old theater lucky secret", "The old theater lucky secret"),
        ("Thumbnail Title: Tomber où?", "Tomber où?"),
        ("Titre : Un saint accident!", "Un saint accident!"),
        ("Título: Ropa invaluable", "Ropa invaluable"),
        ("Titolo: Cose di famiglia", "Cose di famiglia"),
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


def test_audit_title_valid_and_rejections():
    auditor = GeminiAuditor(api_key="mock_key")

    ok, reason = auditor.audit_title(
        "The old theater lucky secret",
        finish_reason="STOP",
        expression="Break a leg",
        video_type="expression",
        language="english",
        previous_titles=["Another title"],
    )
    assert ok
    assert reason == "Valid"

    # Rejects empty and MAX_TOKENS
    assert not auditor.audit_title("", finish_reason="STOP")[0]
    assert not auditor.audit_title("Short", finish_reason="MAX_TOKENS")[0]

    # Rejects multiline, emojis, hashtags, and category prefixes
    assert not auditor.audit_title("Line one\nLine two")[0]
    assert not auditor.audit_title("Lucky secret 😬")[0]
    assert not auditor.audit_title("Lucky secret #Shorts")[0]
    assert not auditor.audit_title("Quiz: REcord or reCORD?")[0]
    assert not auditor.audit_title("In Action: Piece of cake")[0]

    # Rejects bare/lazy repetition of the expression
    bad_lazy, lazy_msg = auditor.audit_title(
        "Break a leg!",
        expression="Break a leg",
        video_type="expression",
        language="english",
    )
    assert not bad_lazy
    assert "raw expression" in lazy_msg

    # Allows genuine game question contrast
    ok_game, _ = auditor.audit_title(
        "REcord or reCORD?",
        expression="REcord vs reCORD",
        video_type="game",
        language="english",
    )
    assert ok_game

    # Rejects duplicates from previous_titles
    bad_dup, dup_msg = auditor.audit_title(
        "Tomber où ?",
        expression="Tomber dans les pommes",
        video_type="expression",
        language="french",
        previous_titles=["Tomber où?"],
    )
    assert not bad_dup
    assert "duplicates" in dup_msg

    # Rejects English leakage in non-English languages
    bad_leak, _ = auditor.audit_title(
        "The secret phrase for theater luck",
        expression="Poser un lapin",
        video_type="expression",
        language="french",
    )
    assert not bad_leak

    # Rejects overly long thumbnail title (> 65 chars)
    assert not auditor.audit_title("A" * 66)[0]

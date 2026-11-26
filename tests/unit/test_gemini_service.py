"""Unit tests for GeminiService SEO description validation and retry resilience."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import requests

from app.services.gemini_service import GeminiService, GeminiServiceError
from helpers import make_gemini_ok_response, make_valid_description

pytestmark = pytest.mark.unit


def test_validate_description_valid():
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    is_valid, reason = svc.validate_description_output(make_valid_description(), finish_reason="STOP")
    assert is_valid
    assert reason == "Valid"


def test_validate_description_truncated_token_limit():
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    is_valid, reason = svc.validate_description_output("A good start...", finish_reason="MAX_TOKENS")
    assert not is_valid
    assert "truncated by token limit" in reason


def test_validate_description_truncated_mid_sentence():
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    mid_sentence = (
        "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
        "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
        "the subtle acoustic double consonant secret native Italians use to get it right every single time in a busy"
    )
    is_valid, reason = svc.validate_description_output(mid_sentence, finish_reason="STOP")
    assert not is_valid
    assert "truncated mid-sentence" in reason


def test_validate_description_too_short_and_missing_hashtags():
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    is_short_ok, short_reason = svc.validate_description_output(
        "This is a one-liner description with a hashtag #Shorts",
        finish_reason="STOP",
    )
    assert not is_short_ok
    assert "too short" in short_reason

    no_tags = (
        "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
        "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
        "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
        "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story in the comments below!"
    )
    is_tag_ok, tag_reason = svc.validate_description_output(no_tags, finish_reason="STOP")
    assert not is_tag_ok
    assert "missing discovery hashtags" in tag_reason


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_generate_short_description_network_retry_success(mock_post, mock_sleep):
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    mock_post.side_effect = [
        requests.exceptions.ConnectionError("Connection timed out"),
        make_gemini_ok_response(make_valid_description()),
    ]
    result = svc.generate_short_description(
        script_id="IE07",
        expression="Doppie consonanti",
        script_changed="Narrator: Watch out for double consonants in Italian!",
    )
    assert result.script_id == "IE07"
    assert "#LearnItalian" in result.hashtags
    assert mock_post.call_count == 2


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_generate_short_description_validation_retry_success(mock_post, mock_sleep):
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")
    trunc_resp = make_gemini_ok_response("You order espresso at a bustling Milan cafe...", finish_reason="MAX_TOKENS")
    ok_resp = make_gemini_ok_response(make_valid_description(), finish_reason="STOP")
    mock_post.side_effect = [trunc_resp, ok_resp]

    result = svc.generate_short_description(
        script_id="IE07",
        expression="Doppie consonanti",
        script_changed="Narrator: Watch out for double consonants in Italian!",
    )
    assert result.script_id == "IE07"
    assert "#LearnItalian" in result.hashtags
    assert mock_post.call_count == 2


@patch("time.sleep", return_value=None)
@patch("requests.post")
def test_generate_short_title_validation_and_retry_success(mock_post, mock_sleep):
    svc = GeminiService(api_key="mock_key", model="gemini-2.5-flash")

    # Missing Column D is blocked
    with pytest.raises(GeminiServiceError, match="Column D"):
        svc.generate_short_title("EE01", "Break a leg", "   ")

    # Missing API key is blocked
    no_key_svc = GeminiService(api_key="", model="gemini-2.5-flash")
    no_key_svc.api_key = ""
    with pytest.raises(GeminiServiceError, match="GEMINI_API_KEY"):
        no_key_svc.generate_short_title("EE01", "Break a leg", "Final script text")

    # Retry rejects duplicate/emoji title and accepts fresh valid title
    dup_resp = make_gemini_ok_response("The old theater lucky secret", finish_reason="STOP")
    emoji_resp = make_gemini_ok_response("Backstage curse 😬", finish_reason="STOP")
    ok_resp = make_gemini_ok_response("Why good luck fails backstage", finish_reason="STOP")
    mock_post.side_effect = [dup_resp, emoji_resp, ok_resp]

    result = svc.generate_short_title(
        script_id="ee01",
        expression="Break a leg",
        script_changed="Stop wishing someone good luck backstage at a theater!",
        previous_titles=["The old theater lucky secret"],
    )
    assert result.script_id == "EE01"
    assert result.short_title == "Why good luck fails backstage"
    assert result.word_count == 5
    assert result.character_count == len("Why good luck fails backstage")
    assert result.angle_used
    assert mock_post.call_count == 3

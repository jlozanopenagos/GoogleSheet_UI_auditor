"""
tests/helpers.py — Reusable factory builders for unit, api, and integration tests.
"""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import MagicMock

# pyrefly: ignore[missing-import]
from app.models.schemas import ScriptRecord


def make_script_record(
    cid: str = "EE01",
    language: str = "english",
    video_type: str = "expression",
    script_ready: bool = True,
    script_changed: str = "Final script content",
    short_description: str = "Engaging description #Shorts #LearnEnglish",
    video_ready: bool = False,
    video_date: str = "",
    expression: str = "Break a leg",
) -> ScriptRecord:
    return ScriptRecord(
        ID=cid,
        expression=expression,
        script=f"Original script {cid}",
        SCRIPT_CHANGED=script_changed,
        script_ready=script_ready,
        script_date="31/01/26",
        video_ready=video_ready,
        video_date=video_date,
        short_description=short_description,
        language=language,
        video_type=video_type,
    )


def make_sheet_row(
    cid: str = "EE01",
    expression: str = "Break a leg",
    script: str = "Old script",
    script_changed: str = "New script",
    short_description: str = "Great description #Shorts",
    script_ready: bool = True,
    script_date: str = "31/01/26",
    video_ready: bool = False,
    video_date: str = "",
) -> Dict[str, Any]:
    return {
        "ID": cid,
        "expression": expression,
        "script": script,
        "SCRIPT_CHANGED": script_changed,
        "short_description": short_description,
        "script_ready": script_ready,
        "script_date": script_date,
        "video_ready": video_ready,
        "video_date": video_date,
    }


def make_valid_description() -> str:
    return (
        "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
        "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
        "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
        "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story below! 👇\n\n"
        "#Shorts #LearnItalian #ItalianTips"
    )


def make_gemini_ok_response(text: str, finish_reason: str = "STOP") -> MagicMock:
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {"parts": [{"text": text}]},
                "finishReason": finish_reason,
            }
        ]
    }
    return mock_resp

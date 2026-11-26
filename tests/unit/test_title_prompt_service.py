"""Unit tests for TitlePromptService format lenses, anti-lazy rules, and angle variation."""

from __future__ import annotations

import pytest

from app.services.title_prompt_service import CREATIVE_ANGLES, TitlePromptService

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("vtype", ["expression", "game", "roleplay", "fun_facts"])
@pytest.mark.parametrize("lang", ["english", "french", "spanish", "italian"])
def test_build_system_prompt_all_formats_and_languages(vtype: str, lang: str):
    prompt = TitlePromptService.build_system_prompt(vtype, lang)
    assert lang.capitalize() in prompt
    assert "ZERO EMOJIS" in prompt
    assert "ANTI-LAZY" in prompt
    assert "HARD MAX 65 chars" in prompt
    assert vtype.upper() in prompt


def test_build_user_prompt_includes_previous_titles_avoidance():
    prompt = TitlePromptService.build_user_prompt(
        expression="Break a leg",
        script_changed="Stop wishing someone good luck backstage at a theater!",
        video_type="expression",
        language="english",
        angle_name="Curiosity Question",
        angle_guidance="Ask a short intriguing question.",
        previous_titles=["The old theater lucky secret", "Why good luck fails"],
    )
    assert "Break a leg" in prompt
    assert "Curiosity Question" in prompt
    assert "DO NOT REPEAT OR CLOSELY PARAPHRASE" in prompt
    assert "- The old theater lucky secret" in prompt
    assert "- Why good luck fails" in prompt


def test_pick_creative_angle_excludes_previous_angles():
    all_angles = [name for name, _ in CREATIVE_ANGLES["game"]]
    excluded = all_angles[:-1]
    picked_name, picked_guidance = TitlePromptService.pick_creative_angle("game", exclude_angles=excluded)
    assert picked_name == all_angles[-1]
    assert picked_guidance

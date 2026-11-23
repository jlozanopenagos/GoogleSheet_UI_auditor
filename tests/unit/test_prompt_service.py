"""Unit tests for PromptService system/user prompt generation and anti-bias rules."""

from __future__ import annotations

import pytest

from app.services.prompt_service import PromptService

pytestmark = pytest.mark.unit


def test_system_prompt_generation_all_formats():
    for fmt in ("expression", "game", "roleplay", "fun_facts"):
        prompt = PromptService.build_system_prompt(fmt, "french")
        assert "TARGET LANGUAGE PURITY" in prompt
        assert "ZERO SPOILERS" in prompt
        assert "TASTEFUL EMOJIS" in prompt
        assert "French" in prompt


def test_user_prompt_construction():
    user_prompt = PromptService.build_user_prompt(
        expression="Break a leg",
        script_changed="Good luck tonight on stage!",
        video_type="expression",
        language="english",
    )
    assert "Break a leg" in user_prompt
    assert "Good luck tonight on stage!" in user_prompt
    assert "EXPRESSION" in user_prompt


def test_system_prompts_free_of_hardcoded_cliches():
    banned_phrases = [
        "ultimate forbidden phrase",
        "forbidden phrase before their big moment",
        "Think wishing someone good luck is harmless",
        "kuh-night and kuh-nee",
        "Who is the friend that always accidentally jinxes everything",
    ]
    for vtype in ("expression", "game", "roleplay", "fun_facts"):
        prompt = PromptService.build_system_prompt(vtype, "english")
        for phrase in banned_phrases:
            assert phrase not in prompt, f"Prompt for '{vtype}' contains biased anchor phrase: '{phrase}'"


def test_system_prompts_mandate_situational_grounding():
    prompt = PromptService.build_system_prompt("roleplay", "spanish")
    assert "SITUATIONAL GROUNDING" in prompt
    assert "BANNED CLICHÉS" in prompt
    assert "100% in Spanish" in prompt

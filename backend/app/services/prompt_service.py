"""
prompt_service.py — Strategy-Pattern YouTube Shorts SEO Description Prompts (Single Responsibility)
"""

from __future__ import annotations

from typing import Dict, Tuple


LANGUAGE_NAMES = {
    "english": "English",
    "french": "French",
    "spanish": "Spanish",
    "italian": "Italian"
}


class PromptService:
    @staticmethod
    def build_system_prompt(video_type: str, language: str) -> str:
        lang_name = LANGUAGE_NAMES.get(language.lower(), "English")
        vtype = video_type.lower()

        base_rules = f"""You are a world-class YouTube Shorts SEO Copywriter and Viral Language Education Director.
Your task is to write a high-CTR, curiosity-driven YouTube Shorts description for a short-form vertical video.

CRITICAL INVARIANTS:
1. TARGET LANGUAGE PURITY: The prose description MUST be written 100% in {lang_name}. Do NOT mix languages in the body text.
2. NO SPOILERS: NEVER reveal the answer, the secret meaning, the quiz solution, or the punchline in the description! It must create intense curiosity so viewers MUST watch the video to find out.
3. LENGTH & PACING: Keep the prose to 1 or 2 snappy, high-impact sentences (under 160 characters before hashtags) so it hooks mobile viewers before the "...more" fold.
4. HASHTAGS: Conclude with exactly 3 to 5 targeted hashtags. You may blend {lang_name} tags with high-traffic global discovery tags (e.g. #Shorts, #Learn{lang_name}).
5. ZERO EMOJIS & ZERO COMMENTARY: Strictly BANNED from using emojis, conversational fluff ("Here is your description:"), or markdown code blocks. Output ONLY the raw description text and hashtags."""

        if vtype == "expression":
            type_specific = f"""
FORMAT FOCUS: EXPRESSION (Idiomatic & Colloquial Secrets)
- Psychological Hook: Highlight the gap between literal word-for-word translation and authentic native usage.
- Tease an awkward, embarrassing, or hilarious conversational misunderstanding without giving away the true meaning.
- Tone: Witty, insider conversational secret, practical daily survival hack.
- Goal: Make the viewer think: "Wait, have I been using this completely wrong?!" """

        elif vtype == "game":
            type_specific = f"""
FORMAT FOCUS: GAME (Interactive Trivia & Acoustic Ear Challenge)
- Psychological Hook: Rapid listening test / ear challenge dilemma.
- Challenge the viewer to test their native intuition or spot the trap before the clock runs out.
- Tone: Addictive, fast-paced game show host, energetic quiz prompt.
- Goal: Make the viewer pause, listen closely, and guess in the comments WITHOUT spoiling the winning choice! """

        elif vtype == "roleplay":
            type_specific = f"""
FORMAT FOCUS: ROLEPLAY (Situational Drama & Relatable Dialogue)
- Psychological Hook: Interpersonal conflict, awkward social tension, or workplace banter between two characters.
- Tease how a single misunderstood phrase created total confusion between friends or colleagues.
- Tone: Engaging situational story, funny conversational drama.
- Goal: Make the viewer want to see how the awkward situation resolves! """

        elif vtype == "fun_facts":
            type_specific = f"""
FORMAT FOCUS: FUN_FACTS (Mind-Bending Linguistic & Cultural Discovery)
- Psychological Hook: The "Wait, really?!" phenomenon. An astonishing historical or cultural curiosity behind words.
- Tease a bizarre linguistic origin story or counter-intuitive language myth.
- Tone: Fascinating micro-documentary, curious, intellect-stimulating.
- Goal: Make the viewer think: "I had no idea that's where this word came from!" """

        else:
            type_specific = f"""
FORMAT FOCUS: General Language Short
- Hook the viewer on mastering this native {lang_name} phrase."""

        return f"{base_rules}\n{type_specific}\n\nOUTPUT FORMAT:\n[1-2 sentence curiosity hook in {lang_name}] [3-5 hashtags]"

    @staticmethod
    def build_user_prompt(expression: str, script_changed: str, video_type: str, language: str) -> str:
        lang_name = LANGUAGE_NAMES.get(language.lower(), "English")
        return f"""Target Language: {lang_name}
Video Format: {video_type.upper()}
Target Expression / Topic: {expression}

Official Video Script:
\"\"\"
{script_changed.strip()}
\"\"\"

Write the high-retention YouTube Shorts description following the system prompt rules. Output ONLY the description text with 3-5 hashtags at the end, zero emojis, zero spoilers."""

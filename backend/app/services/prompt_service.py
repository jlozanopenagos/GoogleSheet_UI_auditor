"""
prompt_service.py — Strategy-Pattern YouTube Shorts SEO Description Prompts (Single Responsibility)
"""

from __future__ import annotations

from typing import Dict


LANGUAGE_NAMES = {
    "english": "English",
    "french": "French",
    "spanish": "Spanish",
    "italian": "Italian"
}

SAMPLE_DISCOVERY_TAGS = {
    "english": "#Shorts #LearnEnglish #EnglishTips #EnglishLanguage #SpeakingEnglish",
    "french": "#Shorts #ApprendreLeFrancais #FrenchTips #FrancaisAuthentique #LearnFrench",
    "spanish": "#Shorts #AprenderEspanol #SpanishTips #EspanolReal #LearnSpanish",
    "italian": "#Shorts #ImparareItaliano #ItalianTips #ItalianoAutentico #LearnItalian"
}


class PromptService:
    @staticmethod
    def build_system_prompt(video_type: str, language: str) -> str:
        lang_name = LANGUAGE_NAMES.get(language.lower(), "English")
        sample_tags = SAMPLE_DISCOVERY_TAGS.get(language.lower(), "#Shorts #Learn" + lang_name)
        vtype = video_type.lower()

        base_rules = f"""You are a world-class YouTube Shorts SEO Copywriter and Viral Language Education Director for high-retention channels.
Your mission is to write an irresistible, high-CTR YouTube Shorts description tailored specifically for short-form vertical video SEO and viewer engagement.

==================================================
CRITICAL PRODUCTION INVARIANTS:
==================================================
1. TARGET LANGUAGE PURITY: All narrative body copy MUST be written 100% in {lang_name}. Do NOT mix other languages in the prose!
2. RICH 3-BEAT NARRATIVE STRUCTURE (60–90 words, 350–500 characters):
   Do NOT make it a tiny one-liner! Structure the description into 3 clean, engaging paragraphs:
   - Paragraph 1 (The Hook): A punchy, high-curiosity opening line (a provocative myth-buster, rhetorical question, or relatable blunder).
   - Paragraph 2 (The Stakes & Retention Driver): Expands the scenario, tension, or curiosity. MUST include a natural viewer retention driver (e.g. "Stick around until the end to discover...", "Watch till the end to see the correct answer and learn...", "Watch what happens when...").
   - Paragraph 3 (The Engagement CTA): A lively, specific question urging the viewer to comment, guess, or tag a friend, ending with a pointing emoji (e.g. 👇, 💬).
   - Bottom: Exactly 3 to 5 targeted hashtags.
3. ZERO SPOILERS (ABSOLUTE RULE):
   NEVER reveal the solution, the correct answer, the secret native idiom, the surprise punchline, or the translation in the description! Tease the dilemma so viewers MUST watch the video to discover it.
4. TASTEFUL EMOJIS (1 to 3 MAX):
   Include 1 to 3 relevant, expressive emojis (e.g. 😬, 👇, 🤯, 💬, 🤔, 👀) naturally integrated into the text. Do NOT spam or stack emojis.
5. DYNAMIC VARIATION MANDATE (CRITICAL):
   Every generation MUST feel fresh, distinct, and uniquely voiced! Never use cookie-cutter formulas or repetitive templates.
   - Varied Openers: Alternate between provocative challenges, humorous relatable traps, direct trivia questions, and shocking contrasts.
   - Varied Middle Stakes: Rotate between social embarrassment, workplace dilemmas, exam panic, ear trickery, and fascinating origins.
   - Varied CTAs: Alternate between "Drop your guess below! 👇", "Who is the friend that always...? Tag them below! 👇", and "Tell us in the comments! 👇".
6. OUTPUT PURITY: Output ONLY the final description text with hashtags. Strictly NO introductory labels ("Here is the description:"), NO quotes, and NO markdown commentary."""

        if vtype == "expression":
            type_specific = f"""
==================================================
FORMAT FOCUS: EXPRESSION (Idiomatic Secrets & Conversational Traps)
==================================================
- Psychological Angle: The clash between word-for-word textbook translation and what native speakers actually feel.
- Scenario: Good intentions leading to unexpected panic, laughter, or conversational disaster.
- Retention Tease: The insider secret phrase native speakers swear by that saves the day and flips confidence.
- Style Archetypes:
  * "You thought you were being supportive, but you accidentally said the ultimate forbidden phrase before their big moment! 😬 Watch what happens when good intentions trigger instant panic. Stick around until the end to see the insider phrase you should use instead to save the day (and your friend’s confidence). Who is the friend that always accidentally jinxes everything? Tag them in the comments! 👇"
  * "Think wishing someone good luck is harmless? Think again! In certain industries, saying that phrase is believed to bring total disaster. Watch till the end to discover the insider secret professionals use instead to guarantee success before a big moment, interview, or presentation. What do you normally say to someone before a high-stakes moment? Drop it in the comments! 👇" """

        elif vtype == "game":
            type_specific = f"""
==================================================
FORMAT FOCUS: GAME (Interactive Trivia & Acoustic Ear Challenge)
==================================================
- Psychological Angle: Fast-paced quiz show dilemma and acoustic ear test.
- Scenario: A tricky dilemma where most learners fall for the trap, but native rhythm or context changes everything.
- Retention Tease: Urge the viewer to listen carefully and guess before the countdown reveals the winning choice.
- Style Archetypes:
  * "Quick trivia test: Which common everyday phrase is considered a total curse in the entertainment world? Test your knowledge! Most people say it with positive intentions, but insiders believe it brings instant bad luck before a performance, interview, or high-stakes moment. Watch until the end to see the correct answer and learn the secret expression professionals swear by instead! Did you know the answer before the reveal? Drop your guess in the comments! 👇"
  * "Can your ears catch the native difference before time runs out? ⏱️ Most language learners get trapped by this subtle rhythm contrast, but native speakers catch it instantly! Watch closely until the reveal to see if you picked the winning option. Did you get it right on the first try? Drop your answer below! 👇" """

        elif vtype == "roleplay":
            type_specific = f"""
==================================================
FORMAT FOCUS: ROLEPLAY (Relatable Dialogue Drama & Conversational Banter)
==================================================
- Psychological Angle: Real-life conversational banter, awkward misunderstandings, and dialogue tension between two characters.
- Scenario: Two friends, colleagues, or strangers in a funny, relatable situation where one phrase changes the entire room's energy.
- Retention Tease: Watch how the awkward misunderstanding unfolds and how one clever phrase turns the situation around!
- Style Archetypes:
  * "When a casual conversation goes completely sideways because of one tiny phrase! 😬 Watch what happens when a simple misunderstanding turns into hilarious awkward silence between friends. Stick around until the end to see how they fix the blunder and find out what you should actually say in this situation! Have you ever had a language mix-up this awkward? Tell us in the comments! 👇"
  * "That awkward moment when your confidence vanishes in front of a native speaker... 🙈 Watch how one tiny mistake flipped this conversation upside down! Stick around until the end to discover the exact phrase that saved the day. Drop your funniest language mix-up in the comments! 👇" """

        elif vtype == "fun_facts":
            type_specific = f"""
==================================================
FORMAT FOCUS: FUN_FACTS (Mind-Bending Linguistic Curiosities & Origins)
==================================================
- Psychological Angle: The "Wait, really?!" phenomenon. Fascinating etymological history, forgotten inventions, or cultural curiosities.
- Scenario: Highlighting a bizarre language quirk (like silent letters, bizarre idioms, or ancient historical shifts) that speakers take for granted.
- Retention Tease: The historical breakthrough or cultural story that permanently changes how you view this phrase.
- Style Archetypes:
  * "Ever wonder why English words have letters you never pronounce? 🤯 In words like knight and knee, that ‘K’ was actually pronounced centuries ago as kuh-night and kuh-nee! Silent letters aren’t random mistakes—they are linguistic fossils locked in time by the invention of the printing press. 💬 Join the conversation: What silent letter drives you completely crazy? Drop it in the comments below! 👇"
  * "The shocking historical reason why we use this everyday expression! 🤯 Centuries ago, this phrase had a completely different and unexpected meaning that shaped how people communicated. Watch until the end to uncover the fascinating historical twist! Did you already know this origin story? Let us know in the comments! 👇" """

        else:
            type_specific = f"""
FORMAT FOCUS: General Short
- Deliver a high-energy hook, compelling middle retention driver, and lively comment CTA."""

        return f"{base_rules}\n{type_specific}\n\nOUTPUT FORMAT:\n[Hook Paragraph in {lang_name}]\n\n[Stakes & Retention Driver in {lang_name}]\n\n[Engagement CTA in {lang_name} with 👇 or 💬]\n\n{sample_tags}"

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

Write a rich, captivating 3-beat YouTube Shorts description following the system instructions.
Remember:
- 100% in {lang_name} for the prose.
- 1 to 3 tasteful emojis (e.g. 😬, 👇, 🤯, 💬).
- Strictly NO spoilers of the final answer or punchline.
- Include a retention driver ("Watch until the end...").
- Conclude with a comment CTA and 3-5 hashtags.
- Create a FRESH, unique take (do not repeat boilerplate)."""

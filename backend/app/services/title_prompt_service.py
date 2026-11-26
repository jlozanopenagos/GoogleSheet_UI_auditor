"""
title_prompt_service.py — Strategy-Pattern Thumbnail Title Prompts for GoogleSheet_UI_auditor
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple

LANGUAGE_NAMES: Dict[str, str] = {
    "english": "English",
    "french": "French",
    "spanish": "Spanish",
    "italian": "Italian",
}

CREATIVE_ANGLES: Dict[str, List[Tuple[str, str]]] = {
    "expression": [
        (
            "Curiosity Question",
            "Ask a short, intriguing question rooted in the literal meaning or social trap from the script (e.g., 'Tomber où?', '¿El precio por un ojo?').",
        ),
        (
            "Playful Cliffhanger",
            "Create an irresistible open loop or ellipsis tease directly tied to the script's twist (e.g., 'The ball is.....').",
        ),
        (
            "Literal-Meaning Paradox",
            "Highlight the absurd or funny image hidden inside the expression in 2–5 punchy words (e.g., 'Soldi 0', 'Cose di famiglia').",
        ),
        (
            "Punchy Rule or Insight",
            "Distill the secret linguistic rule or cultural insight revealed in the script (e.g., 'The old theater lucky secret', 'La place des adjectifs décide!').",
        ),
        (
            "Two-Part Dash Hook",
            "Use a crisp two-part contrast or explanation separated by ' - ' (e.g., 'Blessé - une triche pour les anglophones').",
        ),
    ],
    "game": [
        (
            "Binary Dilemma Question",
            "Frame the exact acoustic, spelling, or meaning duel from the script as a sharp A-or-B question (e.g., 'REcord or reCORD?', '¿Nueva madre o sonrojada?').",
        ),
        (
            "Visual Equation / Contrast",
            "Use '=' or 'vs' to spotlight the deceptive similarity or trap tested in the quiz (e.g., 'Blessé = blessed?').",
        ),
        (
            "Playful Theme Tease",
            "Create a witty thematic umbrella that hints at the quiz topic without spoiling the answer (e.g., 'Expressions fruitées', 'Tennis and English idiom').",
        ),
        (
            "Acoustic / Rule Trap",
            "Call out the hidden pronunciation, double-letter, or grammar trick from the script (e.g., 'Il trucco delle doppie - anno vs ano').",
        ),
        (
            "Direct Challenge Question",
            "Challenge the viewer's instinct in 3–6 words with a crisp question (e.g., 'Chi sono i parenti?').",
        ),
    ],
    "roleplay": [
        (
            "Concrete Scene Snapshot",
            "Capture the exact micro-setting, event, or object from the dialogue in 2–6 words (e.g., 'Après le sport...une pomme', 'Ropa invaluable').",
        ),
        (
            "Comedic Mishap / Blunder",
            "Spotlight the embarrassing slip or misunderstanding between the two speakers (e.g., 'Confesiones equivocadas', 'La figuraccia della \\'ene\\'').",
        ),
        (
            "Two-Part Situation & Question",
            "Pair the scene setting with a quick question or twist separated by ' - ' (e.g., 'Esame finale - Cosa dire al tuo amico?').",
        ),
        (
            "Playful Dialogue Pun",
            "Twist the literal vs. intended meaning from the scene into a witty 2–5 word punchline (e.g., 'Un saint accident!').",
        ),
        (
            "Social Friction Twist",
            "Highlight the interpersonal stakes or surprise reaction from the dialogue (e.g., 'Ospiti inaspetatti per colpa della lingua', 'Your court - Your turn?').",
        ),
    ],
    "fun_facts": [
        (
            "Visual Symbol / Anomaly",
            "Spotlight the strange symbol, spelling quirk, or visual artifact discussed in the script (e.g., 'Signo de interrogación invertido ¿?').",
        ),
        (
            "Hidden Origin Tease",
            "Tease the unexpected historical invention, trade, or cultural origin without giving away the answer.",
        ),
        (
            "Counterintuitive Paradox",
            "Contrast what people assume with the surprising linguistic reality revealed in the script.",
        ),
        (
            "Surprising Fact Question",
            "Pose a tight 3–6 word curiosity question anchored in the historical mystery from the script.",
        ),
        (
            "Linguistic Fossil Hook",
            "Frame the word or rule as a bizarre survivor trapped in modern language.",
        ),
    ],
}


class TitlePromptService:
    @staticmethod
    def pick_creative_angle(
        video_type: str,
        exclude_angles: Optional[List[str]] = None,
    ) -> Tuple[str, str]:
        """Randomly selects a creative title angle for the format, avoiding recently used angles when possible."""
        vtype = (video_type or "expression").strip().lower()
        pool = CREATIVE_ANGLES.get(vtype, CREATIVE_ANGLES["expression"])
        excluded = {a.strip().lower() for a in (exclude_angles or []) if a and a.strip()}
        candidates = [item for item in pool if item[0].lower() not in excluded]
        return random.choice(candidates or pool)

    @staticmethod
    def build_system_prompt(video_type: str, language: str) -> str:
        lang_name = LANGUAGE_NAMES.get((language or "english").strip().lower(), "English")
        vtype = (video_type or "expression").strip().lower()

        base_rules = f"""You are a Viral Thumbnail Copywriter and Creative Director for a multilingual YouTube Shorts language channel.
Your job is to craft ONE ultra-punchy, scroll-stopping **thumbnail title** (rendered in large display typography on a chalkboard/panel thumbnail AND saved as the Short title).

==================================================
CRITICAL THUMBNAIL TITLE INVARIANTS:
==================================================
1. TARGET LANGUAGE PURITY: Write 100% in {lang_name}. NEVER leak English words into French, Spanish, or Italian titles. Use natural punctuation for {lang_name} (including opening ¿ / ¡ in Spanish when asking/exclaiming).
2. COMPACT THUMBNAIL SWEET SPOT (2 to 7 words, ideal <= 45 chars, HARD MAX 65 chars):
   - Short, bold phrases look huge and readable on a vertical thumbnail. Aim for 2 to 7 words.
   - Single line ONLY. No line breaks.
3. STRICTLY ZERO EMOJIS, ZERO HASHTAGS, ZERO CATEGORY PREFIXES:
   - NEVER include emojis (display fonts cannot render them).
   - NEVER include hashtags (#Shorts, etc.).
   - NEVER start with labels like "Quiz:", "Game:", "Expression:", "Roleplay:", "In Action:", "Origin:", "Fun Fact:", or "Title:".
   - NEVER use cliché suffixes like ": the native secret", ": le secret des natifs", ": el secreto de los nativos", or ": il segreto dei nativi".
4. ANTI-LAZY & TRIAD DIFFERENTIATION RULE (CRITICAL):
   - E (Expression), G (Game), and R (Roleplay) videos often share the SAME target expression.
   - NEVER simply output the raw target expression (e.g., do NOT return "Break a leg" or "Tomber dans les pommes" or "Costar un ojo de la cara") or "Format + Expression".
   - You MUST extract the specific scene, twist, irony, double meaning, or dilemma directly from the provided Column D script so the title fits THIS exact video.
5. OUTPUT PURITY:
   - Return ONLY the final title text itself. No surrounding quotes (unless quoting dialogue deliberately), no explanations, no prefixes."""

        if vtype == "expression":
            type_specific = """
==================================================
FORMAT LENS: EXPRESSION (Idiomatic Curiosity & Twist)
==================================================
Spotlight the absurd literal image, cultural paradox, suspense cliffhanger, or surprising rule from the script.
Real channel examples you should match in wit & brevity:
- EN: "The old theater lucky secret" | "The ball is....." | "Actually is the same as now?"
- FR: "Tomber où?" | "Blessé - une triche pour les anglophones" | "La place des adjectifs décide!"
- ES: "¿El precio por un ojo?" | "Preguntas, respuestas o motivos"
- IT: "Soldi 0" | "Cose di famiglia" """

        elif vtype == "game":
            type_specific = """
==================================================
FORMAT LENS: GAME (Snappy Quiz, Equation & Dilemma)
==================================================
Spotlight the exact acoustic pair, false friend, binary choice, or playful category tested in the script without spoiling the answer.
Real channel examples you should match in wit & brevity:
- EN: "REcord or reCORD?" | "Tennis and English idiom"
- FR: "Expressions fruitées" | "Blessé = blessed?"
- ES: "¿Nueva madre o sonrojada?"
- IT: "Chi sono i parenti?" | "Il trucco delle doppie - anno vs ano" """

        elif vtype == "roleplay":
            type_specific = """
==================================================
FORMAT LENS: ROLEPLAY (Concrete Scene & Comedic Mishap)
==================================================
Anchor strictly in the concrete setting, social event, or awkward blunder happening between the speakers in the script.
Real channel examples you should match in wit & brevity:
- EN: "Your court - Your turn?" | "Reality vs. office gossip over one simple word"
- FR: "Après le sport...une pomme" | "Un saint accident!" | "On parle de taille ou de caractère?"
- ES: "Ropa invaluable" | "Confesiones equivocadas"
- IT: "Esame finale - Cosa dire al tuo amico?" | "La figuraccia della 'ene'" | "Ospiti inaspetatti per colpa della lingua" """

        elif vtype == "fun_facts":
            type_specific = """
==================================================
FORMAT LENS: FUN_FACTS (Surprising Symbol, Origin & Paradox)
==================================================
Spotlight the weird linguistic fossil, visual symbol, or historical accident revealed in the script without spoiling the punchline.
Real channel example:
- ES: "Signo de interrogación invertido ¿?" """

        else:
            type_specific = """
FORMAT LENS: General Short
Craft a concise, witty 2-7 word thumbnail title anchored in the script's specific twist."""

        return f"{base_rules}\n{type_specific}"

    @staticmethod
    def build_user_prompt(
        expression: str,
        script_changed: str,
        video_type: str,
        language: str,
        angle_name: str,
        angle_guidance: str,
        previous_titles: Optional[List[str]] = None,
    ) -> str:
        lang_name = LANGUAGE_NAMES.get((language or "english").strip().lower(), "English")
        avoid_items = [t.strip() for t in (previous_titles or []) if t and t.strip()]

        avoid_block = ""
        if avoid_items:
            listed = "\n".join(f"- {t}" for t in avoid_items)
            avoid_block = f"""
DO NOT REPEAT OR CLOSELY PARAPHRASE ANY OF THESE PREVIOUS TITLES:
{listed}
Create a noticeably different angle, wording, and structure from every item above.
"""

        return f"""Target Language: {lang_name}
Video Format: {video_type.upper()}
Target Expression / Topic: {expression}

Required Creative Angle: {angle_name}
Angle Guidance: {angle_guidance}

Official Video Script (Column D):
\"\"\"
{script_changed.strip()}
\"\"\"
{avoid_block}
Write ONE fresh, punchy thumbnail title (2–7 words, ideal <= 45 chars, 100% in {lang_name}, zero emojis, zero category prefixes, and NOT a bare copy of "{expression}").
Output ONLY the title text."""

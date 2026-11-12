"""
test_auditor.py — Unit & Integration Test Suite for GoogleSheet_UI_auditor
"""

import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# pyrefly: ignore[missing-import]
from fastapi.testclient import TestClient
# pyrefly: ignore[missing-import]
from app.core.routing import parse_and_route_id, IdRoutingError
# pyrefly: ignore[missing-import]
from app.services.prompt_service import PromptService
# pyrefly: ignore[missing-import]
from app.services.sheet_service import SheetService, ScriptNotFoundError
# pyrefly: ignore[missing-import]
from app.services.gemini_service import GeminiService, GeminiServiceError, gemini_service
# pyrefly: ignore[missing-import]
from app.services.script_doctor_service import (
    ScriptDoctorService,
    ROLEPLAY_SYSTEM_PROMPT,
    GAME_SYSTEM_PROMPT,
    FUN_FACTS_SYSTEM_PROMPT,
    EXPRESSION_SYSTEM_PROMPT
)
# pyrefly: ignore[missing-import]
from main import app


class TestIdRouting(unittest.TestCase):
    def test_valid_canonical_ids_across_all_languages(self):
        cases = [
            ("EE01", "english", "expression"),
            ("EG03", "english", "game"),
            ("ER15", "english", "roleplay"),
            ("EF02", "english", "fun_facts"),
            ("FE01", "french", "expression"),
            ("FG04", "french", "game"),
            ("FR02", "french", "roleplay"),
            ("FF10", "french", "fun_facts"),
            ("SE08", "spanish", "expression"),
            ("SG02", "spanish", "game"),
            ("SR04", "spanish", "roleplay"),
            ("SF01", "spanish", "fun_facts"),
            ("IE02", "italian", "expression"),
            ("IG05", "italian", "game"),
            ("IR01", "italian", "roleplay"),
            ("IF03", "italian", "fun_facts"),
        ]
        for raw_id, expected_lang, expected_type in cases:
            with self.subTest(raw_id=raw_id):
                parsed = parse_and_route_id(raw_id)
                self.assertEqual(parsed.canonical_id, raw_id)
                self.assertEqual(parsed.language, expected_lang)
                self.assertEqual(parsed.video_type, expected_type)
                self.assertTrue(len(parsed.spreadsheet_id) > 10)

    def test_invalid_id_formats_raise_routing_error(self):
        invalid_ids = ["", "XYZ", "123", "E01", "EE", "ZZ01", "EEXX", "None"]
        for bad_id in invalid_ids:
            with self.subTest(bad_id=bad_id):
                with self.assertRaises(IdRoutingError):
                    parse_and_route_id(bad_id)


class TestPromptService(unittest.TestCase):
    def test_system_prompt_generation_all_formats(self):
        formats = ["expression", "game", "roleplay", "fun_facts"]
        for fmt in formats:
            prompt = PromptService.build_system_prompt(fmt, "french")
            self.assertIn("TARGET LANGUAGE PURITY", prompt)
            self.assertIn("ZERO SPOILERS", prompt)
            self.assertIn("TASTEFUL EMOJIS", prompt)
            self.assertIn("French", prompt)

    def test_user_prompt_construction(self):
        user_prompt = PromptService.build_user_prompt(
            expression="Break a leg",
            script_changed="Good luck tonight on stage!",
            video_type="expression",
            language="english"
        )
        self.assertIn("Break a leg", user_prompt)
        self.assertIn("Good luck tonight on stage!", user_prompt)
        self.assertIn("EXPRESSION", user_prompt)


class TestSheetService(unittest.TestCase):
    @patch.object(SheetService, "_http_get")
    def test_fetch_script_by_id_success(self, mock_get):
        mock_get.return_value = {
            "status": "success",
            "count": 2,
            "data": [
                {
                    "ID": "EE01",
                    "expression": "Break a leg",
                    "script": "Original script for EE01",
                    "SCRIPT_CHANGED": "New script for EE01",
                    "script_ready": True,
                    "script_date": "31/01/26",
                    "short_description": "Curiosity description #Shorts #LearnEnglish"
                },
                {
                    "ID": "EE02",
                    "expression": "Bite the bullet",
                    "script": "Original script for EE02"
                }
            ]
        }

        service = SheetService()
        record = service.fetch_script_by_id("EE01")

        self.assertEqual(record.ID, "EE01")
        self.assertEqual(record.expression, "Break a leg")
        self.assertEqual(record.script, "Original script for EE01")
        self.assertEqual(record.SCRIPT_CHANGED, "New script for EE01")
        self.assertTrue(record.script_ready)
        self.assertEqual(record.script_date, "31/01/26")
        self.assertEqual(record.short_description, "Curiosity description #Shorts #LearnEnglish")

    @patch.object(SheetService, "_http_get")
    def test_fetch_script_by_id_not_found(self, mock_get):
        mock_get.return_value = {
            "status": "success",
            "count": 1,
            "data": [{"ID": "EE02", "expression": "Something else"}]
        }

        service = SheetService()
        with self.assertRaises(ScriptNotFoundError):
            service.fetch_script_by_id("EE01")


class TestFastApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["app"], "GoogleSheet_UI_auditor")

    @patch.object(SheetService, "fetch_script_by_id")
    def test_get_script_endpoint_success(self, mock_fetch):
        # pyrefly: ignore[missing-import]
        from app.models.schemas import ScriptRecord
        mock_fetch.return_value = ScriptRecord(
            ID="EE01",
            expression="A blessing in disguise",
            script="Old script",
            SCRIPT_CHANGED="New script",
            script_ready=False,
            script_date="15/02/26",
            short_description="Great description",
            language="english",
            video_type="expression"
        )

        resp = self.client.get("/api/sheets/script/EE01")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["ID"], "EE01")
        self.assertEqual(body["data"]["expression"], "A blessing in disguise")

    def test_get_script_invalid_id_format(self):
        resp = self.client.get("/api/sheets/script/INVALID_ID_999")
        self.assertEqual(resp.status_code, 400)

    @patch("app.routers.gemini.script_doctor_service.doctor_script")
    def test_doctor_script_endpoint_success(self, mock_doctor):
        mock_doctor.return_value = {
            "script_id": "EF01",
            "expression": "Silent letters",
            "doctored_script": "Ever wonder why silent letters exist in English? Centuries ago, knights spoke them aloud!",
            "word_count": 15
        }

        resp = self.client.post("/api/gemini/doctor-script", json={
            "script_id": "EF01",
            "expression": "Silent letters",
            "original_script": "Old draft text about silent letters"
        })
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["script_id"], "EF01")
        self.assertIn("knights", body["data"]["doctored_script"])


class TestScriptDoctorService(unittest.TestCase):
    def test_clean_script_output(self):
        service = ScriptDoctorService(api_key="mock_key")
        raw = "```text\nHere is the doctored script:\nThis is the actual script content.\n\n[CHALKBOARD_EXERCISE]\nLine 1: Test ___\nLine 2: A) Option A\nWord Count: 7 words\n```"
        cleaned = service._clean_script_output(raw)
        self.assertEqual(cleaned, "This is the actual script content.")

    def test_empty_script_raises_error(self):
        service = ScriptDoctorService(api_key="mock_key")
        with self.assertRaises(ValueError):
            service.doctor_script("EF01", "Silent letters", "")

    def test_system_prompt_rules_enforcement(self):
        # ROLEPLAY: 6 blocks, peer banter, no tutor tropes
        self.assertIn("NO POLITE TUTOR", ROLEPLAY_SYSTEM_PROMPT)
        self.assertIn("6-BLOCK PARAGRAPH STRUCTURE", ROLEPLAY_SYSTEM_PROMPT)
        self.assertIn("145 to 180 words", ROLEPLAY_SYSTEM_PROMPT)

        # GAME: logical coherence, multiple choice with carrier context, zero bare words, no chalkboard card
        self.assertIn("DO NOT OUTPUT [CHALKBOARD_EXERCISE]", GAME_SYSTEM_PROMPT)
        self.assertIn("LOGICAL COHERENCE & CHALLENGE TYPES", GAME_SYSTEM_PROMPT)
        self.assertIn("MULTIPLE CHOICE IS ENCOURAGED", GAME_SYSTEM_PROMPT)
        self.assertIn("ZERO ISOLATED BARE WORDS", GAME_SYSTEM_PROMPT)
        self.assertIn("95 to 125 words", GAME_SYSTEM_PROMPT)

        # FUN_FACTS: 100% factual integrity, 3 to 5 paragraphs
        self.assertIn("100% FACTUAL INTEGRITY", FUN_FACTS_SYSTEM_PROMPT)
        self.assertIn("3 TO 5 CLEAN NARRATIVE PARAGRAPHS", FUN_FACTS_SYSTEM_PROMPT)

        # EXPRESSION: 5 paragraphs, word budget 85 to 110 words
        self.assertIn("5-PARAGRAPH PROGRESSION", EXPRESSION_SYSTEM_PROMPT)
        self.assertIn("85 to 110 words", EXPRESSION_SYSTEM_PROMPT)


class TestGeminiServiceValidationAndResilience(unittest.TestCase):
    def setUp(self):
        self.service = GeminiService(api_key="mock_key", model="gemini-2.5-flash")

    def test_validate_description_valid(self):
        valid_desc = (
            "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
            "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
            "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
            "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story in the comments! 👇\n\n"
            "#Shorts #LearnItalian #ItalianTips #ItalianoAutentico #LearnItalian"
        )
        is_valid, reason = self.service.validate_description_output(valid_desc, finish_reason="STOP")
        self.assertTrue(is_valid)
        self.assertEqual(reason, "Valid")

    def test_validate_description_truncated_token_limit(self):
        desc = "A good start to a description that was cut off by max tokens..."
        is_valid, reason = self.service.validate_description_output(desc, finish_reason="MAX_TOKENS")
        self.assertFalse(is_valid)
        self.assertIn("truncated by token limit", reason)

    def test_validate_description_truncated_mid_sentence(self):
        mid_sentence = (
            "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
            "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
            "the subtle acoustic double consonant secret native Italians use to get it right every single time in a busy"
        )
        is_valid, reason = self.service.validate_description_output(mid_sentence, finish_reason="STOP")
        self.assertFalse(is_valid)
        self.assertIn("truncated mid-sentence", reason)

    def test_validate_description_too_short(self):
        short = "This is a one-liner description with a hashtag #Shorts"
        is_valid, reason = self.service.validate_description_output(short, finish_reason="STOP")
        self.assertFalse(is_valid)
        self.assertIn("too short", reason)

    def test_validate_description_missing_hashtags(self):
        no_tags = (
            "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
            "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
            "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
            "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story in the comments below!"
        )
        is_valid, reason = self.service.validate_description_output(no_tags, finish_reason="STOP")
        self.assertFalse(is_valid)
        self.assertIn("missing discovery hashtags", reason)

    @patch("time.sleep", return_value=None)
    @patch("requests.post")
    def test_generate_short_description_network_retry_success(self, mock_post, mock_sleep):
        # Attempt 1: network exception, Attempt 2: success
        success_body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": (
                                    "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
                                    "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
                                    "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
                                    "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story below! 👇\n\n"
                                    "#Shorts #LearnItalian #ItalianTips"
                                )
                            }
                        ]
                    },
                    "finishReason": "STOP"
                }
            ]
        }
        mock_resp_success = MagicMock(status_code=200)
        mock_resp_success.json.return_value = success_body

        import requests
        mock_post.side_effect = [
            requests.exceptions.ConnectionError("Connection timed out"),
            mock_resp_success
        ]

        result = self.service.generate_short_description(
            script_id="IE07",
            expression="Doppie consonanti",
            script_changed="Narrator: Watch out for double consonants in Italian!"
        )
        self.assertEqual(result.script_id, "IE07")
        self.assertIn("#LearnItalian", result.hashtags)
        self.assertEqual(mock_post.call_count, 2)

    @patch("time.sleep", return_value=None)
    @patch("requests.post")
    def test_generate_short_description_validation_retry_success(self, mock_post, mock_sleep):
        # Attempt 1: truncated response (MAX_TOKENS), Attempt 2: valid complete response
        truncated_body = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "You order espresso at a bustling Milan cafe..."}]
                    },
                    "finishReason": "MAX_TOKENS"
                }
            ]
        }
        success_body = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": (
                                    "You order espresso at a bustling Milan cafe, but one wrong consonant turns your request into sheer comedy! ☕\n\n"
                                    "Watch what happens when the barista stares in total confusion. Stick around until the end to discover "
                                    "the subtle acoustic double-consonant secret native Italians use to get it right every single time.\n\n"
                                    "Have you ever had an embarrassing pronunciation slip in Italy? Drop your story below! 👇\n\n"
                                    "#Shorts #LearnItalian #ItalianTips"
                                )
                            }
                        ]
                    },
                    "finishReason": "STOP"
                }
            ]
        }
        mock_resp_trunc = MagicMock(status_code=200)
        mock_resp_trunc.json.return_value = truncated_body

        mock_resp_success = MagicMock(status_code=200)
        mock_resp_success.json.return_value = success_body

        mock_post.side_effect = [mock_resp_trunc, mock_resp_success]

        result = self.service.generate_short_description(
            script_id="IE07",
            expression="Doppie consonanti",
            script_changed="Narrator: Watch out for double consonants in Italian!"
        )
        self.assertEqual(result.script_id, "IE07")
        self.assertIn("#LearnItalian", result.hashtags)
        self.assertEqual(mock_post.call_count, 2)


class TestPromptServiceAntiBias(unittest.TestCase):
    def test_system_prompts_free_of_hardcoded_cliches(self):
        # Ensure the old repetitive examples are completely removed
        banned_phrases = [
            "ultimate forbidden phrase",
            "forbidden phrase before their big moment",
            "Think wishing someone good luck is harmless",
            "kuh-night and kuh-nee",
            "Who is the friend that always accidentally jinxes everything"
        ]
        for vtype in ["expression", "game", "roleplay", "fun_facts"]:
            prompt = PromptService.build_system_prompt(vtype, "english")
            for phrase in banned_phrases:
                self.assertNotIn(
                    phrase,
                    prompt,
                    f"Prompt for format '{vtype}' contains biased anchor phrase: '{phrase}'"
                )

    def test_system_prompts_mandate_situational_grounding(self):
        prompt = PromptService.build_system_prompt("roleplay", "spanish")
        self.assertIn("SITUATIONAL GROUNDING", prompt)
        self.assertIn("BANNED CLICHÉS", prompt)
        self.assertIn("100% in Spanish", prompt)


class TestScriptDoctorValidation(unittest.TestCase):
    def setUp(self):
        self.service = ScriptDoctorService(api_key="mock_key")

    def test_validate_doctored_script_valid(self):
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
        is_valid, reason = self.service.validate_doctored_script(valid_script, finish_reason="STOP", vtype="roleplay")
        self.assertTrue(is_valid)
        self.assertEqual(reason, "Valid")

    def test_validate_doctored_script_truncated(self):
        is_valid, reason = self.service.validate_doctored_script("Some script", finish_reason="MAX_TOKENS", vtype="game")
        self.assertFalse(is_valid)
        self.assertIn("MAX_TOKENS", reason)

    def test_validate_doctored_script_abrupt_ending(self):
        script_abrupt = (
            "Narrator (energetic): You thought asking for a glass of tap water in Paris was easy.\n\n"
            "PERSON_ONE (hesitant): Excusez-moi, est-ce que je peux avoir de l'eau s'il vous plaît?\n"
            "PERSON_TWO (smirking): De l'eau en bouteille à dix euros ou une carafe gratuite?\n\n"
            "PERSON_ONE (shocked): Attends, il y a un mot magique pour ne pas payer dix euros?\n"
            "PERSON_TWO (confident): Une carafe d'eau. C'est la loi, c'est gratuit et c'est parfait.\n\n"
            "PERSON_ONE (relieved): Une carafe d'eau fraîche, s'il vous plaît!\n"
            "PERSON_TWO (approving): Voilà, maintenant tu commandes comme un vrai Parisien"
        )
        is_valid, reason = self.service.validate_doctored_script(script_abrupt, finish_reason="STOP", vtype="roleplay")
        self.assertFalse(is_valid)
        self.assertIn("abruptly mid-sentence", reason)


if __name__ == "__main__":
    unittest.main()



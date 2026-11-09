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

from fastapi.testclient import TestClient
from app.core.routing import parse_and_route_id, IdRoutingError
from app.services.prompt_service import PromptService
from app.services.sheet_service import SheetService, ScriptNotFoundError
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
            self.assertIn("NO SPOILERS", prompt)
            self.assertIn("ZERO EMOJIS", prompt)
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


if __name__ == "__main__":
    unittest.main()

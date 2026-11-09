"""
sheet_service.py — Resilient Google Sheets Service for GoogleSheet_UI_auditor
"""

from __future__ import annotations

import json
import logging
import time
from typing import Dict, Any, Optional, List
import requests

from ..core.config import settings
from ..core.routing import parse_and_route_id, ParsedId
from ..models.schemas import ScriptRecord

logger = logging.getLogger(__name__)


class SheetServiceError(Exception):
    """Base exception for sheet operations."""
    pass


class ScriptNotFoundError(SheetServiceError):
    """Raised when an ID is valid but not found in the target Google Sheet."""
    pass


class SheetService:
    def __init__(self, master_webapp_url: Optional[str] = None):
        self.master_url = master_webapp_url or settings.master_webapp_url
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "GoogleSheet-UI-Auditor/1.0 (Local Automation)"
        })

    def fetch_script_by_id(self, raw_id: str) -> ScriptRecord:
        """
        Parses ID, queries target Google Sheet, and returns the matching ScriptRecord.
        
        Raises:
            IdRoutingError: If ID syntax is invalid or endpoint not found.
            ScriptNotFoundError: If ID does not exist in the spreadsheet.
            SheetServiceError: If communication with Google Sheets fails.
        """
        parsed: ParsedId = parse_and_route_id(raw_id)

        # Build query URL using Option A router: ?id=<SPREADSHEET_ID>
        query_url = f"{self.master_url}?id={parsed.spreadsheet_id}"
        if parsed.gid:
            query_url += f"&gid={parsed.gid}"

        logger.info(f"Fetching {parsed.canonical_id} from spreadsheet {parsed.spreadsheet_id}")
        data = self._http_get(query_url)

        records = data.get("data", [])
        if not records and not isinstance(records, list):
            raise SheetServiceError(f"Unexpected data format returned from Google Sheet: {data}")

        # Search for exact ID match (case-insensitive)
        target_id_upper = parsed.canonical_id.upper()
        matching_row: Optional[Dict[str, Any]] = None

        for row in records:
            row_id = str(row.get("ID") or row.get("id") or "").strip().upper()
            if row_id == target_id_upper:
                matching_row = row
                break

        if not matching_row:
            raise ScriptNotFoundError(
                f"Script ID '{parsed.canonical_id}' was not found in the {parsed.language.capitalize()} "
                f"{parsed.video_type.replace('_', ' ').capitalize()} Google Sheet."
            )

        # Map to canonical ScriptRecord
        return ScriptRecord(
            ID=parsed.canonical_id,
            row_number=matching_row.get("row_number"),
            expression=str(matching_row.get("expression") or matching_row.get("topic") or matching_row.get("subject") or "").strip(),
            script=str(matching_row.get("script") or "").strip(),
            SCRIPT_CHANGED=str(matching_row.get("SCRIPT_CHANGED") or matching_row.get("new_script") or "").strip(),
            script_ready=bool(matching_row.get("script_ready") is True or matching_row.get("script_ready") == "true"),
            script_date=str(matching_row.get("script_date") or "").strip(),
            video_ready=bool(matching_row.get("video_ready") is True or matching_row.get("video_ready") == "true"),
            video_date=str(matching_row.get("video_date") or "").strip(),
            short_description=str(matching_row.get("short_description") or matching_row.get("description") or "").strip(),
            language=parsed.language,
            video_type=parsed.video_type,
            sheet_url=parsed.sheet_url
        )

    def update_script_fields(
        self,
        script_id: str,
        script_changed: str,
        script_ready: bool,
        script_date: str
    ) -> Dict[str, Any]:
        """
        Updates Column D (SCRIPT_CHANGED), Column E (script_ready), and Column F (script_date)
        in place on Google Sheets.
        """
        parsed: ParsedId = parse_and_route_id(script_id)

        payload = {
            "action": "update_script",
            "spreadsheet_id": parsed.spreadsheet_id,
            "gid": parsed.gid,
            "script_id": parsed.canonical_id,
            "SCRIPT_CHANGED": script_changed,
            "script_ready": script_ready,
            "script_date": script_date
        }

        logger.info(f"Updating script fields for {parsed.canonical_id} in {parsed.spreadsheet_id} (gid={parsed.gid})")
        res = self._http_post(self.master_url, payload)

        # Validate that the Apps Script actually executed an update
        if res.get("status") == "error":
            raise SheetServiceError(f"Google Sheet error: {res.get('message', 'Unknown error')}")

        if res.get("message") == "Data processed successfully" and res.get("count") == 0:
            raise SheetServiceError(
                "Google Sheet returned 'count: 0'. The Google Apps Script deployed in your Google Sheet is still running the old placeholder code! "
                "Please deploy the updated Code.gs in Google Sheets (Extensions > Apps Script > Deploy > New version)."
            )

        return res

    def update_description_field(
        self,
        script_id: str,
        short_description: str
    ) -> Dict[str, Any]:
        """
        Updates Column I (short_description) in place on Google Sheets.
        """
        parsed: ParsedId = parse_and_route_id(script_id)

        payload = {
            "action": "update_description",
            "spreadsheet_id": parsed.spreadsheet_id,
            "gid": parsed.gid,
            "script_id": parsed.canonical_id,
            "short_description": short_description
        }

        logger.info(f"Updating description for {parsed.canonical_id} in {parsed.spreadsheet_id} (gid={parsed.gid})")
        res = self._http_post(self.master_url, payload)

        if res.get("status") == "error":
            raise SheetServiceError(f"Google Sheet error: {res.get('message', 'Unknown error')}")

        if res.get("message") == "Data processed successfully" and res.get("count") == 0:
            raise SheetServiceError(
                "Google Sheet returned 'count: 0'. The Google Apps Script deployed in your Google Sheet is still running the old placeholder code! "
                "Please deploy the updated Code.gs in Google Sheets (Extensions > Apps Script > Deploy > New version)."
            )

        return res

    def _http_get(self, url: str) -> Dict[str, Any]:
        last_error = None
        for attempt in range(1, settings.max_retries + 1):
            try:
                resp = self.session.get(url, timeout=settings.request_timeout, allow_redirects=True)
                if resp.status_code in (200, 201):
                    return self._parse_json_response(resp.text)
                raise SheetServiceError(f"Google Sheet API returned HTTP {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                last_error = e
                logger.warning(f"GET attempt {attempt} failed: {e}. Retrying...")
                time.sleep(1.0 * attempt)
        raise SheetServiceError(f"Failed to fetch data from Google Sheet: {last_error}")

    def _http_post(self, url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        last_error = None
        for attempt in range(1, settings.max_retries + 1):
            try:
                resp = self.session.post(
                    url,
                    json=payload,
                    timeout=settings.request_timeout,
                    allow_redirects=True
                )
                if resp.status_code in (200, 201):
                    return self._parse_json_response(resp.text)
                raise SheetServiceError(f"Google Sheet API returned HTTP {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                last_error = e
                logger.warning(f"POST attempt {attempt} failed: {e}. Retrying...")
                time.sleep(1.0 * attempt)
        raise SheetServiceError(f"Failed to post update to Google Sheet: {last_error}")

    def _parse_json_response(self, text: str) -> Dict[str, Any]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Check for Google Drive HTML error pages
            if "<html" in text.lower():
                raise SheetServiceError("Google Apps Script returned an HTML error page (permissions or quota issue).")
            raise SheetServiceError(f"Malformed JSON response: {text[:200]}")


# Shared singleton instance
sheet_service = SheetService()


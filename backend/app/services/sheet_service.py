"""
sheet_service.py — Resilient Google Sheets Service for GoogleSheet_UI_auditor
"""

from __future__ import annotations

import json
import logging
import time
from typing import Dict, Any, Optional, List, Tuple
import requests

from ..core.config import settings, ENDPOINT_REGISTRY, extract_spreadsheet_id, extract_gid
from ..core.routing import parse_and_route_id, ParsedId, IdRoutingError
from ..models.schemas import ScriptRecord
from .calendar_service import calendar_service

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
            short_title=str(matching_row.get("short_title") or matching_row.get("title") or "").strip(),
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

    def update_title_field(
        self,
        script_id: str,
        short_title: str
    ) -> Dict[str, Any]:
        """
        Updates Column J (short_title) in place on Google Sheets. Requires non-empty text.
        """
        clean_title = str(short_title or "").strip()
        if not clean_title:
            raise ValueError("Short title cannot be empty.")

        parsed: ParsedId = parse_and_route_id(script_id)

        payload = {
            "action": "update_title",
            "spreadsheet_id": parsed.spreadsheet_id,
            "gid": parsed.gid,
            "script_id": parsed.canonical_id,
            "short_title": clean_title,
        }

        logger.info(f"Updating short title for {parsed.canonical_id} in {parsed.spreadsheet_id} (gid={parsed.gid})")
        res = self._http_post(self.master_url, payload)

        if res.get("status") == "error":
            raise SheetServiceError(f"Google Sheet error: {res.get('message', 'Unknown error')}")

        if "updated_fields" not in res and (
            res.get("count") == 0
            or res.get("message") in ("Data processed successfully", "No rows provided")
        ):
            raise SheetServiceError(
                "Google Sheet returned an unexpected empty response. Please deploy the updated standalone Code.gs for GoogleSheet_UI_auditor."
            )

        return res

    def update_launch_fields(
        self,
        script_id: str,
        video_ready: bool,
        video_date: str,
        script_ready: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Updates Column G (`video_ready`), Column H (`video_date`), and optionally Column E (`script_ready`)
        in place on Google Sheets for YouTube Launch Calendar synchronization.
        """
        parsed: ParsedId = parse_and_route_id(script_id)

        payload: Dict[str, Any] = {
            "action": "update_launch",
            "spreadsheet_id": parsed.spreadsheet_id,
            "gid": parsed.gid,
            "script_id": parsed.canonical_id,
            "video_ready": bool(video_ready),
            "video_date": str(video_date or "").strip(),
        }
        if script_ready is not None:
            payload["script_ready"] = bool(script_ready)

        logger.info(f"Updating launch fields for {parsed.canonical_id} in {parsed.spreadsheet_id} (gid={parsed.gid})")
        res = self._http_post(self.master_url, payload)

        if res.get("status") == "error":
            raise SheetServiceError(f"Google Sheet error: {res.get('message', 'Unknown error')}")

        if "updated_fields" not in res and (
            res.get("count") == 0
            or res.get("message") in ("Data processed successfully", "No rows provided")
        ):
            raise SheetServiceError(
                "Google Sheet returned an empty batch response. Please deploy the updated Code.gs in Google Sheets."
            )

        return res

    def sync_calendar_from_all_sheets(self, clear_unscheduled: bool = True) -> Dict[str, Any]:
        """Pulls all 16 Google Sheet tabs in parallel and reconciles scheduled entries into CalendarService."""
        from concurrent.futures import ThreadPoolExecutor, as_completed

        if clear_unscheduled:
            calendar_service.clear_unscheduled_ids()

        def _fetch_tab(lang: str, vtype: str, endpoint_url: str) -> Tuple[str, str, int]:
            spreadsheet_id = extract_spreadsheet_id(endpoint_url)
            gid = extract_gid(endpoint_url)
            query_url = f"{self.master_url}?id={spreadsheet_id}"
            if gid:
                query_url += f"&gid={gid}"
            data = self._http_get(query_url)
            records = data.get("data", [])
            if not isinstance(records, list):
                raise SheetServiceError(f"Unexpected data format for {lang}/{vtype}")
            added = calendar_service.reconcile_from_sheet_records(lang, vtype, records)
            return lang, vtype, added

        total_added = 0
        errors: List[str] = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {
                pool.submit(_fetch_tab, lang, vtype, url): (lang, vtype)
                for (lang, vtype), url in ENDPOINT_REGISTRY.items()
            }
            for fut in as_completed(futures):
                lang, vtype = futures[fut]
                try:
                    _, _, added = fut.result()
                    total_added += added
                except Exception as exc:
                    errors.append(f"{lang}/{vtype}: {exc}")

        return {
            "synced_added": total_added,
            "tabs_checked": len(ENDPOINT_REGISTRY),
            "errors": errors,
        }

    def fetch_matrix_category(self, language: str, video_type: str) -> Dict[str, Any]:
        """
        Fetches all records for a given language and video type, returning a lightweight 4-state list
        of matrix items (`violet` | `green` | `yellow` | `grey`).
        """
        lang_clean = language.strip().lower()
        vtype_clean = video_type.strip().lower()
        endpoint_url = ENDPOINT_REGISTRY.get((lang_clean, vtype_clean), "")
        if not endpoint_url:
            raise IdRoutingError(
                f"No Google Sheet endpoint configured for {language.capitalize()} {video_type.replace('_', ' ').capitalize()}."
            )

        spreadsheet_id = extract_spreadsheet_id(endpoint_url)
        gid = extract_gid(endpoint_url)

        query_url = f"{self.master_url}?id={spreadsheet_id}"
        if gid:
            query_url += f"&gid={gid}"

        logger.info(f"Fetching matrix for {lang_clean} {vtype_clean} from {spreadsheet_id}")
        data = self._http_get(query_url)
        records = data.get("data", [])
        if not isinstance(records, list):
            raise SheetServiceError(f"Unexpected data format returned from Google Sheet: {data}")

        # Sync any previously launched sheet rows (Col G video_ready + Col H video_date) into calendar state
        calendar_service.reconcile_from_sheet_records(lang_clean, vtype_clean, records)

        items = []
        for r in records:
            raw_id = str(r.get("ID") or r.get("id") or "").strip().upper()
            if not raw_id:
                continue
            script_changed = str(r.get("SCRIPT_CHANGED") or r.get("new_script") or "").strip()
            short_desc = str(r.get("short_description") or r.get("description") or "").strip()
            short_title = str(r.get("short_title") or r.get("title") or "").strip()

            has_script_changed = bool(script_changed)
            has_short_description = bool(short_desc)
            has_short_title = bool(short_title)
            cal_entry = calendar_service.get_entry(raw_id)
            launch_date = cal_entry.get("sheet_date", "") if cal_entry else ""
            launch_date_iso = cal_entry.get("launch_date", "") if cal_entry else ""

            # Four-state logic:
            # - Violet: On Launch Calendar AND Col D + Col I filled
            # - Green: Col D filled AND Col I filled (ready to schedule on Launch Calendar)
            # - Yellow: Col D filled, but Col I empty
            # - Grey: Col D empty
            if cal_entry and has_script_changed and has_short_description:
                status = "violet"
            elif has_script_changed and has_short_description:
                status = "green"
            elif has_script_changed:
                status = "yellow"
            else:
                status = "grey"

            items.append({
                "id": raw_id,
                "script_ready": bool(r.get("script_ready") is True or r.get("script_ready") == "true"),
                "video_ready": bool(
                    cal_entry
                    or r.get("video_ready") is True
                    or r.get("video_ready") == "true"
                ),
                "expression": str(r.get("expression") or r.get("topic") or r.get("subject") or "").strip(),
                "script_date": str(r.get("script_date") or "").strip(),
                "launch_date": launch_date,
                "launch_date_iso": launch_date_iso,
                "has_script_changed": has_script_changed,
                "has_short_description": has_short_description,
                "short_title": short_title,
                "has_short_title": has_short_title,
                "status": status
            })

        return {
            "language": lang_clean,
            "video_type": vtype_clean,
            "sheet_url": endpoint_url,
            "count": len(items),
            "items": items
        }

    def batch_update_ready_items(
        self,
        language: str,
        video_type: str,
        updates: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Batch updates script_ready checkbox (and optional script_date) for multiple IDs in a sheet.
        """
        lang_clean = language.strip().lower()
        vtype_clean = video_type.strip().lower()
        endpoint_url = ENDPOINT_REGISTRY.get((lang_clean, vtype_clean), "")
        if not endpoint_url:
            raise IdRoutingError(
                f"No Google Sheet endpoint configured for {language.capitalize()} {video_type.replace('_', ' ').capitalize()}."
            )

        spreadsheet_id = extract_spreadsheet_id(endpoint_url)
        gid = extract_gid(endpoint_url)

        rows_payload = []
        for u in updates:
            row_dict: Dict[str, Any] = {
                "id": str(u.get("id", "")).strip().upper(),
                "script_ready": bool(u.get("script_ready"))
            }
            if u.get("script_date"):
                row_dict["script_date"] = str(u.get("script_date")).strip()
            rows_payload.append(row_dict)

        payload = {
            "action": "batch_update",
            "spreadsheet_id": spreadsheet_id,
            "gid": gid,
            "rows": rows_payload
        }

        logger.info(f"Batch updating {len(rows_payload)} rows in {spreadsheet_id} (gid={gid})")
        res = self._http_post(self.master_url, payload)

        if res.get("status") == "error":
            raise SheetServiceError(f"Google Sheet error: {res.get('message', 'Unknown error')}")

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


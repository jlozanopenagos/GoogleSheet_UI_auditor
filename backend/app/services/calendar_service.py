"""
calendar_service.py — Dynamic YouTube Launch Calendar Persistence, Readiness Gate & Cadence Rules.
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..models.schemas import ScriptRecord

DEFAULT_CALENDAR_STORAGE = (
    Path(__file__).resolve().parent.parent.parent / "data" / "launch_calendar.json"
)


def normalize_launch_date(raw_date: str) -> Tuple[str, str]:
    """
    Normalizes an input date string into `(iso_yyyy_mm_dd, sheet_dd_mm_yy)`.

    Accepts:
      - `YYYY-MM-DD` (e.g. `2026-11-20`)
      - `DD/MM/YY` or `DD/MM/YYYY` (also with `-` or `.` separators)
    """
    clean = str(raw_date or "").strip()
    if not clean:
        raise ValueError("Launch date cannot be empty.")

    iso_match = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", clean)
    if iso_match:
        dt = datetime(
            int(iso_match.group(1)),
            int(iso_match.group(2)),
            int(iso_match.group(3)),
        )
        return dt.strftime("%Y-%m-%d"), dt.strftime("%d/%m/%y")

    dmy_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", clean)
    if dmy_match:
        day = int(dmy_match.group(1))
        month = int(dmy_match.group(2))
        yr_raw = dmy_match.group(3)
        year = (2000 + int(yr_raw)) if len(yr_raw) == 2 else int(yr_raw)
        dt = datetime(year, month, day)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%d/%m/%y")

    raise ValueError(
        f"Invalid launch date '{clean}'. Expected YYYY-MM-DD or DD/MM/YY (e.g. 2026-11-20 or 20/11/26)."
    )


class CalendarService:
    """Manages YouTube launch schedule entries, readiness checks, and per-language daily quotas."""

    def __init__(self, storage_path: Optional[Path] = None):
        self.storage_path: Path = Path(storage_path) if storage_path else DEFAULT_CALENDAR_STORAGE
        self._lock = threading.RLock()
        self._entries: Dict[str, Dict[str, Any]] = {}
        self._unscheduled_ids: set[str] = set()
        self._load()

    def _load(self) -> None:
        with self._lock:
            if not self.storage_path.exists():
                self._entries = {}
                self._unscheduled_ids = set()
                return
            try:
                payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            except Exception:
                self._entries = {}
                self._unscheduled_ids = set()
                return

            if not isinstance(payload, dict):
                return

            raw_entries = payload.get("entries", {})
            loaded: Dict[str, Dict[str, Any]] = {}
            if isinstance(raw_entries, dict):
                for raw_id, item in raw_entries.items():
                    if not isinstance(item, dict):
                        continue
                    cid = str(item.get("id") or raw_id).strip().upper()
                    if not cid or not item.get("launch_date"):
                        continue
                    loaded[cid] = {
                        "id": cid,
                        "launch_date": str(item.get("launch_date", "")),
                        "sheet_date": str(item.get("sheet_date", "")),
                        "language": str(item.get("language", "")).strip().lower(),
                        "video_type": str(item.get("video_type", "")).strip().lower(),
                        "expression": str(item.get("expression", "")),
                        "script_ready": bool(item.get("script_ready", True)),
                        "video_ready": bool(item.get("video_ready", True)),
                        "sheet_synced": bool(item.get("sheet_synced", True)),
                        "scheduled_at": str(item.get("scheduled_at", "")),
                    }
            self._entries = loaded
            raw_unsched = payload.get("unscheduled_ids", [])
            self._unscheduled_ids = {
                str(x).strip().upper()
                for x in raw_unsched
                if isinstance(x, str) and x.strip()
            }

    def _save(self) -> None:
        with self._lock:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": "1.0",
                "entries": {k: self._entries[k] for k in sorted(self._entries.keys())},
                "unscheduled_ids": sorted(self._unscheduled_ids),
            }
            self.storage_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    def get_entry(self, script_id: str) -> Optional[Dict[str, Any]]:
        cid = str(script_id or "").strip().upper()
        with self._lock:
            entry = self._entries.get(cid)
            return dict(entry) if entry else None

    def list_entries(
        self,
        month: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        month_prefix = month.strip() if month and month.strip() else None
        lang_filter = language.strip().lower() if language and language.strip().lower() not in ("", "all") else None

        with self._lock:
            items = []
            for entry in self._entries.values():
                if month_prefix and not str(entry.get("launch_date", "")).startswith(month_prefix):
                    continue
                if lang_filter and entry.get("language") != lang_filter:
                    continue
                items.append(dict(entry))

        items.sort(key=lambda x: (x.get("launch_date", ""), x.get("language", ""), x.get("id", "")))
        return items

    def summarize_entries(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Builds monthly/filtered summary metrics for UI cards."""
        by_language: Dict[str, int] = {}
        by_type: Dict[str, int] = {}
        day_lang_buckets: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}

        for ent in entries:
            lang = ent.get("language", "")
            vtype = ent.get("video_type", "")
            l_date = ent.get("launch_date", "")
            if lang:
                by_language[lang] = by_language.get(lang, 0) + 1
            if vtype:
                by_type[vtype] = by_type.get(vtype, 0) + 1
            if l_date and lang:
                day_lang_buckets.setdefault((l_date, lang), []).append(ent)

        fun_fact_days = 0
        triad_complete_days = 0
        triad_partial_days = 0
        for bucket in day_lang_buckets.values():
            types_present = {e.get("video_type") for e in bucket}
            if "fun_facts" in types_present:
                fun_fact_days += 1
            if {"expression", "game", "roleplay"}.issubset(types_present):
                triad_complete_days += 1
            elif types_present - {"fun_facts"}:
                triad_partial_days += 1

        return {
            "total": len(entries),
            "by_language": by_language,
            "by_video_type": by_type,
            "active_day_language_slots": len(day_lang_buckets),
            "fun_fact_days": fun_fact_days,
            "triad_complete_days": triad_complete_days,
            "triad_partial_days": triad_partial_days,
        }

    def reconcile_from_sheet_records(
        self,
        language: str,
        video_type: str,
        records: List[Dict[str, Any]],
    ) -> int:
        """
        Backfills already-launched sheet rows (Column G video_ready=True & Column H video_date present
        alongside Column D + Column I) into local calendar state unless explicitly unscheduled.
        """
        lang_clean = language.strip().lower()
        vtype_clean = video_type.strip().lower()
        added = 0

        with self._lock:
            for r in records:
                raw_id = str(r.get("ID") or r.get("id") or "").strip().upper()
                if not raw_id or raw_id in self._entries or raw_id in self._unscheduled_ids:
                    continue

                video_ready = bool(r.get("video_ready") is True or str(r.get("video_ready")).lower() == "true")
                raw_vdate = str(r.get("video_date") or "").strip()
                has_script = bool(str(r.get("SCRIPT_CHANGED") or r.get("new_script") or "").strip())
                has_desc = bool(str(r.get("short_description") or r.get("description") or "").strip())

                if not (video_ready and raw_vdate and has_script and has_desc):
                    continue

                try:
                    iso_date, sheet_date = normalize_launch_date(raw_vdate)
                except ValueError:
                    continue

                self._entries[raw_id] = {
                    "id": raw_id,
                    "launch_date": iso_date,
                    "sheet_date": sheet_date,
                    "language": lang_clean,
                    "video_type": vtype_clean,
                    "expression": str(r.get("expression") or r.get("topic") or r.get("subject") or "").strip(),
                    "script_ready": bool(r.get("script_ready") is True or str(r.get("script_ready")).lower() == "true"),
                    "video_ready": True,
                    "sheet_synced": True,
                    "scheduled_at": datetime.now(timezone.utc).isoformat(),
                }
                added += 1

            if added > 0:
                self._save()

        return added

    @staticmethod
    def evaluate_readiness(record: ScriptRecord) -> Dict[str, Any]:
        """
        Decision 3 Option A: Requires Column D (`SCRIPT_CHANGED`), Column E (`script_ready`),
        and Column I (`short_description`). Flags `can_auto_check_col_e` if only Col E is unchecked.
        """
        has_script_changed = bool((record.SCRIPT_CHANGED or "").strip())
        script_ready = bool(record.script_ready)
        has_short_description = bool((record.short_description or "").strip())

        missing_reasons: List[str] = []
        if not has_script_changed:
            missing_reasons.append("Column D (SCRIPT_CHANGED) is empty")
        if not script_ready:
            missing_reasons.append("Column E (script_ready checkbox) is not checked")
        if not has_short_description:
            missing_reasons.append("Column I (short_description) is empty")

        can_auto_check_col_e = has_script_changed and has_short_description and not script_ready
        readiness_ok = has_script_changed and script_ready and has_short_description

        recommended_action: Optional[str] = None
        if not has_script_changed:
            recommended_action = "script_auditor"
        elif not has_short_description:
            recommended_action = "description_creation"
        elif not script_ready:
            recommended_action = "auto_check_col_e"

        return {
            "readiness_ok": readiness_ok,
            "has_script_changed": has_script_changed,
            "script_ready": script_ready,
            "has_short_description": has_short_description,
            "can_auto_check_col_e": can_auto_check_col_e,
            "missing_reasons": missing_reasons,
            "recommended_action": recommended_action,
        }

    def evaluate_daily_cadence(
        self,
        *,
        script_id: str,
        language: str,
        video_type: str,
        iso_date: str,
        sheet_date: str,
    ) -> Dict[str, Any]:
        """
        Decision 1 Option A + Decision 2 Option A:
        Per-language daily cadence rules with guided soft warnings:
          - Fun Fact Day: 1 `fun_facts` short
          - Triad Day: up to 3 shorts (max 1 `expression`, 1 `game`, 1 `roleplay`)
        """
        cid = script_id.strip().upper()
        lang_clean = language.strip().lower()
        vtype_clean = video_type.strip().lower()

        with self._lock:
            existing_self = self._entries.get(cid)
            already_scheduled_entry = dict(existing_self) if existing_self else None
            day_lang_entries = [
                dict(e)
                for e in self._entries.values()
                if e.get("launch_date") == iso_date
                and e.get("language") == lang_clean
                and e.get("id") != cid
            ]

        warnings: List[str] = []
        lang_label = lang_clean.capitalize()

        if len(day_lang_entries) >= 3:
            warnings.append(
                f"{lang_label} already has {len(day_lang_entries)} shorts on {sheet_date} (normal max is 3: 1 Expression, 1 Game, 1 Roleplay)."
            )

        same_type_items = [e["id"] for e in day_lang_entries if e.get("video_type") == vtype_clean]
        if same_type_items:
            vtype_label = vtype_clean.replace("_", " ").capitalize()
            warnings.append(
                f"{lang_label} already has a {vtype_label} short on {sheet_date} ({', '.join(same_type_items)})."
            )

        if vtype_clean == "fun_facts" and len(day_lang_entries) > 0:
            existing_ids = ", ".join(e["id"] for e in day_lang_entries)
            if not same_type_items:
                warnings.append(
                    f"Fun Fact shorts normally run solo (1 per day) for {lang_label}; {sheet_date} already has {existing_ids}."
                )
        elif vtype_clean != "fun_facts":
            existing_ff = [e["id"] for e in day_lang_entries if e.get("video_type") == "fun_facts"]
            if existing_ff:
                warnings.append(
                    f"{sheet_date} is a Fun Fact Day for {lang_label} ({', '.join(existing_ff)}); normally E/G/R triads run on separate days."
                )

        if already_scheduled_entry:
            is_same_date = already_scheduled_entry.get("launch_date") == iso_date
            move_note = (
                f"{cid} is already scheduled on {already_scheduled_entry.get('sheet_date')}."
                if is_same_date
                else f"{cid} is currently scheduled on {already_scheduled_entry.get('sheet_date')} and will move to {sheet_date}."
            )
        else:
            is_same_date = False
            move_note = ""

        return {
            "cadence_ok": len(warnings) == 0,
            "warnings": warnings,
            "day_slot_count": len(day_lang_entries),
            "existing_day_entries": day_lang_entries,
            "already_scheduled_entry": already_scheduled_entry,
            "is_same_date": is_same_date,
            "move_note": move_note,
        }

    def schedule_entry(
        self,
        *,
        script_id: str,
        iso_date: str,
        sheet_date: str,
        language: str,
        video_type: str,
        expression: str,
        script_ready: bool = True,
        video_ready: bool = True,
        sheet_synced: bool = True,
    ) -> Dict[str, Any]:
        cid = script_id.strip().upper()
        entry = {
            "id": cid,
            "launch_date": iso_date,
            "sheet_date": sheet_date,
            "language": language.strip().lower(),
            "video_type": video_type.strip().lower(),
            "expression": (expression or "").strip(),
            "script_ready": bool(script_ready),
            "video_ready": bool(video_ready),
            "sheet_synced": bool(sheet_synced),
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._unscheduled_ids.discard(cid)
            self._entries[cid] = entry
            self._save()
        return dict(entry)

    def clear_unscheduled_ids(self) -> int:
        with self._lock:
            count = len(self._unscheduled_ids)
            if count > 0:
                self._unscheduled_ids.clear()
                self._save()
            return count

    def unschedule_entry(self, script_id: str) -> Optional[Dict[str, Any]]:
        cid = script_id.strip().upper()
        with self._lock:
            removed = self._entries.pop(cid, None)
            self._unscheduled_ids.add(cid)
            self._save()
        return dict(removed) if removed else None


# Shared singleton instance
calendar_service = CalendarService()

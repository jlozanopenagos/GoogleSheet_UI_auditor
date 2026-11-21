"""
calendar.py — REST API Router for YouTube Launch Calendar & Cadence Validation
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException, Path, Query

from ..core.routing import IdRoutingError, parse_and_route_id
from ..models.schemas import (
    ApiResponse,
    CalendarCheckRequest,
    CalendarScheduleRequest,
)
from ..services.calendar_service import calendar_service, normalize_launch_date
from ..services.sheet_service import (
    ScriptNotFoundError,
    SheetServiceError,
    sheet_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/calendar", tags=["Launch Calendar"])


@router.get("/entries", response_model=ApiResponse)
def get_calendar_entries(
    month: Optional[str] = Query(None, description="Optional YYYY-MM filter"),
    language: Optional[str] = Query(None, description="Optional language filter (all, english, french, spanish, italian)"),
) -> ApiResponse:
    """Lists scheduled YouTube Shorts launches and monthly/language cadence summaries."""
    entries = calendar_service.list_entries(month=month, language=language)
    summary = calendar_service.summarize_entries(entries)
    return ApiResponse(
        success=True,
        message=f"Loaded {len(entries)} scheduled launch entry(s).",
        data={
            "entries": entries,
            "summary": summary,
        },
    )


@router.post("/check", response_model=ApiResponse)
def check_calendar_id(payload: CalendarCheckRequest) -> ApiResponse:
    """
    Validates script readiness (Column D + Column E + Column I) and per-language daily cadence
    before scheduling an ID onto the Launch Calendar.
    """
    try:
        parsed = parse_and_route_id(payload.script_id)
        iso_date, sheet_date = normalize_launch_date(payload.launch_date)
    except (IdRoutingError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        record = sheet_service.fetch_script_by_id(parsed.canonical_id)
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except SheetServiceError as exc:
        logger.error(f"Sheet check error for {parsed.canonical_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))

    readiness = calendar_service.evaluate_readiness(record)
    cadence = calendar_service.evaluate_daily_cadence(
        script_id=record.ID,
        language=record.language,
        video_type=record.video_type,
        iso_date=iso_date,
        sheet_date=sheet_date,
    )

    return ApiResponse(
        success=True,
        message=f"Preflight check completed for {record.ID}.",
        data={
            "record": record.model_dump(),
            "iso_date": iso_date,
            "sheet_date": sheet_date,
            "readiness": readiness,
            "cadence": cadence,
        },
    )


@router.post("/schedule", response_model=ApiResponse)
def schedule_calendar_id(payload: CalendarScheduleRequest) -> ApiResponse:
    """
    Checks Column D, E, and I readiness + per-language daily cadence rules, persists the entry to
    `launch_calendar.json`, and updates Column G (`video_ready`) & Column H (`video_date`) in Google Sheets.
    """
    try:
        parsed = parse_and_route_id(payload.script_id)
        iso_date, sheet_date = normalize_launch_date(payload.launch_date)
    except (IdRoutingError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        record = sheet_service.fetch_script_by_id(parsed.canonical_id)
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except SheetServiceError as exc:
        logger.error(f"Sheet fetch error scheduling {parsed.canonical_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))

    auto_checked_col_e = False
    if (
        payload.auto_check_script_ready
        and not record.script_ready
        and (record.SCRIPT_CHANGED or "").strip()
        and (record.short_description or "").strip()
    ):
        record.script_ready = True
        auto_checked_col_e = True

    readiness = calendar_service.evaluate_readiness(record)
    cadence = calendar_service.evaluate_daily_cadence(
        script_id=record.ID,
        language=record.language,
        video_type=record.video_type,
        iso_date=iso_date,
        sheet_date=sheet_date,
    )

    if not readiness["readiness_ok"]:
        return ApiResponse(
            success=False,
            message="Cannot schedule: " + "; ".join(readiness["missing_reasons"]) + ".",
            data={
                "requires_readiness": True,
                "requires_override": False,
                "iso_date": iso_date,
                "sheet_date": sheet_date,
                "record": record.model_dump(),
                "readiness": readiness,
                "cadence": cadence,
            },
        )

    existing_self = cadence.get("already_scheduled_entry")
    if (
        existing_self
        and existing_self.get("launch_date") != iso_date
        and not payload.allow_move
        and not payload.force_override
    ):
        return ApiResponse(
            success=False,
            message=cadence["move_note"],
            data={
                "requires_readiness": False,
                "requires_override": True,
                "iso_date": iso_date,
                "sheet_date": sheet_date,
                "record": record.model_dump(),
                "readiness": readiness,
                "cadence": cadence,
            },
        )

    if not cadence["cadence_ok"] and not payload.force_override:
        return ApiResponse(
            success=False,
            message="Daily cadence rule warning: " + " ".join(cadence["warnings"]),
            data={
                "requires_readiness": False,
                "requires_override": True,
                "iso_date": iso_date,
                "sheet_date": sheet_date,
                "record": record.model_dump(),
                "readiness": readiness,
                "cadence": cadence,
            },
        )

    # Persist Column G (video_ready=TRUE), Column H (video_date=DD/MM/YY), and optionally Column E
    sheet_synced = False
    sheet_sync_warning = ""
    try:
        res: Dict[str, Any] = sheet_service.update_launch_fields(
            script_id=record.ID,
            video_ready=True,
            video_date=sheet_date,
            script_ready=True if auto_checked_col_e else None,
        )
        updated_fields = res.get("updated_fields")
        # Legacy Code.gs fallback returns updated_count instead of updated_fields
        if isinstance(updated_fields, list):
            sheet_synced = "video_date" in updated_fields or "video_ready" in updated_fields
        else:
            sheet_synced = bool(res.get("status") == "success")
    except SheetServiceError as exc:
        sheet_sync_warning = str(exc)
        logger.warning(f"Launch Calendar Google Sheet sync warning for {record.ID}: {exc}")

    entry = calendar_service.schedule_entry(
        script_id=record.ID,
        iso_date=iso_date,
        sheet_date=sheet_date,
        language=record.language,
        video_type=record.video_type,
        expression=record.expression,
        script_ready=record.script_ready,
        video_ready=True,
        sheet_synced=sheet_synced,
    )

    note_parts = [f"Scheduled {record.ID} on {sheet_date}."]
    if auto_checked_col_e:
        note_parts.append("Checked Column E (script_ready=TRUE).")
    if existing_self and existing_self.get("launch_date") != iso_date:
        note_parts.append(f"Moved from {existing_self.get('sheet_date')}.")
    if not sheet_synced:
        note_parts.append(
            f"Saved in Launch Calendar; Google Sheet Col G/H sync skipped ({sheet_sync_warning or 'redeploy Code.gs for Col G/H sync'})."
        )

    return ApiResponse(
        success=True,
        message=" ".join(note_parts),
        data={
            "entry": entry,
            "sheet_synced": sheet_synced,
            "sheet_sync_warning": sheet_sync_warning,
            "readiness": readiness,
            "cadence": cadence,
            "record": record.model_dump(),
        },
    )


@router.delete("/entries/{script_id}", response_model=ApiResponse)
def delete_calendar_entry(
    script_id: str = Path(..., description="Canonical ID to remove from Launch Calendar"),
) -> ApiResponse:
    """Removes an ID from the Launch Calendar and clears Column G/H launch markers in Google Sheets."""
    try:
        parsed = parse_and_route_id(script_id)
    except IdRoutingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    removed = calendar_service.unschedule_entry(parsed.canonical_id)
    sheet_cleared = False
    try:
        sheet_service.update_launch_fields(
            script_id=parsed.canonical_id,
            video_ready=False,
            video_date="",
        )
        sheet_cleared = True
    except SheetServiceError as exc:
        logger.warning(f"Could not clear Google Sheet launch fields for {parsed.canonical_id}: {exc}")

    return ApiResponse(
        success=True,
        message=f"Removed {parsed.canonical_id} from Launch Calendar (Bingo card reverted to Green).",
        data={
            "removed": removed,
            "sheet_cleared": sheet_cleared,
        },
    )

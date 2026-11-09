"""
sheets.py — REST API Router for Google Sheets script operations
"""

from __future__ import annotations

import logging
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException, Path

from ..models.schemas import (
    ScriptRecord,
    UpdateScriptRequest,
    UpdateDescriptionRequest,
    ApiResponse
)
from ..core.routing import IdRoutingError
from ..services.sheet_service import sheet_service, ScriptNotFoundError, SheetServiceError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sheets", tags=["Google Sheets"])


@router.get("/script/{script_id}", response_model=ApiResponse)
def get_script_by_id(
    script_id: str = Path(..., description="Canonical ID e.g. EE01, FG03")
) -> ApiResponse:
    """Fetches script record and metadata from Google Sheets for the given ID."""
    try:
        record = sheet_service.fetch_script_by_id(script_id)
        return ApiResponse(
            success=True,
            message=f"Script '{record.ID}' found successfully.",
            data=record.model_dump()
        )
    except IdRoutingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ScriptNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SheetServiceError as e:
        logger.error(f"Sheet service error for {script_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error fetching script {script_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@router.post("/script/{script_id}/update-script", response_model=ApiResponse)
def update_script(
    script_id: str,
    payload: UpdateScriptRequest
) -> ApiResponse:
    """Updates Column D (SCRIPT_CHANGED), Column E (script_ready), and Column F (script_date) in place."""
    if payload.script_id.upper() != script_id.upper():
        raise HTTPException(status_code=400, detail="Path script_id does not match payload script_id.")

    try:
        result = sheet_service.update_script_fields(
            script_id=script_id,
            script_changed=payload.SCRIPT_CHANGED,
            script_ready=payload.script_ready,
            script_date=payload.script_date
        )
        return ApiResponse(
            success=True,
            message=f"Successfully updated script for ID {script_id.upper()} in Google Sheet.",
            data=result
        )
    except IdRoutingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SheetServiceError as e:
        logger.error(f"Sheet update error for {script_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error updating script {script_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@router.post("/script/{script_id}/update-description", response_model=ApiResponse)
def update_description(
    script_id: str,
    payload: UpdateDescriptionRequest
) -> ApiResponse:
    """Updates Column I (short_description) in place on Google Sheets."""
    if payload.script_id.upper() != script_id.upper():
        raise HTTPException(status_code=400, detail="Path script_id does not match payload script_id.")

    try:
        result = sheet_service.update_description_field(
            script_id=script_id,
            short_description=payload.short_description
        )
        return ApiResponse(
            success=True,
            message=f"Successfully updated description for ID {script_id.upper()} in Google Sheet.",
            data=result
        )
    except IdRoutingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SheetServiceError as e:
        logger.error(f"Description update error for {script_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error updating description {script_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


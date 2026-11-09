"""
gemini.py — REST API Router for Gemini YouTube Shorts SEO Description generation
"""

from __future__ import annotations

import logging
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    GeminiGenerateRequest,
    ApiResponse
)
from ..core.routing import IdRoutingError
from ..services.gemini_service import gemini_service, GeminiServiceError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gemini", tags=["Gemini AI SEO"])


@router.post("/generate-description", response_model=ApiResponse)
def generate_description(payload: GeminiGenerateRequest) -> ApiResponse:
    """Generates an SEO YouTube Shorts description using Google Gemini API."""
    try:
        response = gemini_service.generate_short_description(
            script_id=payload.script_id,
            expression=payload.expression,
            script_changed=payload.script_changed
        )
        return ApiResponse(
            success=True,
            message="SEO YouTube Shorts description generated successfully.",
            data=response.model_dump()
        )
    except IdRoutingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GeminiServiceError as e:
        logger.warning(f"Gemini generation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in Gemini generation: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini API failure: {e}")


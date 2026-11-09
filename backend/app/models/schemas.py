"""
schemas.py — Typed Pydantic Schemas & Data Contracts for GoogleSheet_UI_auditor
"""

from __future__ import annotations

from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ScriptRecord(BaseModel):
    ID: str
    row_number: Optional[int] = None
    expression: str = ""
    script: str = ""                  # Column C (original script)
    SCRIPT_CHANGED: str = ""          # Column D (edited script)
    script_ready: bool = False        # Column E (checkbox)
    script_date: str = ""             # Column F (DD/MM/YY)
    video_ready: bool = False         # Column G
    video_date: str = ""              # Column H
    short_description: str = ""       # Column I (YouTube Shorts SEO description)
    language: str = ""
    video_type: str = ""
    sheet_url: Optional[str] = None


class UpdateScriptRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    SCRIPT_CHANGED: str = Field(..., description="New / modified script text for Column D")
    script_ready: bool = Field(False, description="Checkbox state for Column E")
    script_date: str = Field("", description="Scheduled broadcast date for Column F (DD/MM/YY)")


class UpdateDescriptionRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    short_description: str = Field(..., description="YouTube Shorts SEO description for Column I")


class GeminiGenerateRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    expression: str = Field(..., description="Target expression name (Column B)")
    script_changed: str = Field(..., description="Spoken script text from Column D (required)")


class GeminiGenerateResponse(BaseModel):
    script_id: str
    short_description: str
    word_count: int
    character_count: int
    hashtags: List[str] = Field(default_factory=list)


class ApiResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[Any] = None
    error: Optional[str] = None

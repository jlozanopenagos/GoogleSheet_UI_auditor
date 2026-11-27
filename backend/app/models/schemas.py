"""
schemas.py — Typed Pydantic Schemas & Data Contracts for GoogleSheet_UI_auditor
"""

from __future__ import annotations

from typing import Optional, List, Any
# pyrefly: ignore[missing-import]
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
    short_title: str = ""             # Column J (YouTube Shorts title)
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


class UpdateTitleRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    short_title: str = Field(..., description="YouTube Shorts title for Column J (non-empty)")


class GeminiGenerateRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    expression: str = Field(..., description="Target expression name (Column B)")
    script_changed: str = Field(..., description="Spoken script text from Column D (required)")


class DoctorScriptRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EF01)")
    expression: str = Field(..., description="Target expression name (Column B)")
    original_script: str = Field(..., description="Original draft script from Column C")


class GeminiGenerateResponse(BaseModel):
    script_id: str
    short_description: str
    word_count: int
    character_count: int
    hashtags: List[str] = Field(default_factory=list)


class GeminiTitleGenerateRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01)")
    expression: str = Field(..., description="Target expression or topic (Column B)")
    script_changed: str = Field(..., description="Spoken script text from Column D (required)")
    previous_titles: List[str] = Field(
        default_factory=list,
        description="Previously saved or generated titles to avoid repeating",
    )


class GeminiTitleGenerateResponse(BaseModel):
    script_id: str
    short_title: str
    word_count: int
    character_count: int
    angle_used: str = ""


class MatrixItem(BaseModel):
    id: str
    script_ready: bool = False
    video_ready: bool = False
    expression: str = ""
    script_date: str = ""
    launch_date: str = ""
    launch_date_iso: str = ""
    has_script_changed: bool = False
    has_short_description: bool = False
    short_title: str = ""
    has_short_title: bool = False
    status: str = "grey"  # "violet" | "green" | "yellow" | "grey"


class MatrixCategoryResponse(BaseModel):
    language: str
    video_type: str
    sheet_url: Optional[str] = None
    count: int = 0
    items: List[MatrixItem] = Field(default_factory=list)


class CalendarEntry(BaseModel):
    id: str
    launch_date: str                  # YYYY-MM-DD
    sheet_date: str                   # DD/MM/YY
    language: str
    video_type: str
    expression: str = ""
    script_ready: bool = True
    video_ready: bool = True
    sheet_synced: bool = True
    scheduled_at: str = ""


class CalendarCheckRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EF01, SE02)")
    launch_date: str = Field(..., description="Target launch date (YYYY-MM-DD or DD/MM/YY)")


class CalendarScheduleRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EF01, SE02)")
    launch_date: str = Field(..., description="Target launch date (YYYY-MM-DD or DD/MM/YY)")
    auto_check_script_ready: bool = Field(
        False,
        description="Automatically mark Column E script_ready=TRUE if Col D and Col I are ready"
    )
    force_override: bool = Field(
        False,
        description="Override daily per-language cadence soft warning (1 Fun Fact or max 3 E/G/R)"
    )
    allow_move: bool = Field(
        True,
        description="Allow moving an already-scheduled ID to a new date"
    )


class BatchUpdateReadyItem(BaseModel):
    id: str
    script_ready: bool
    script_date: Optional[str] = ""


class BatchUpdateReadyRequest(BaseModel):
    language: str
    video_type: str
    updates: List[BatchUpdateReadyItem]


class YouTubeTargetStatus(BaseModel):
    target: str
    connected: bool = False
    channel_id: str = ""
    channel_title: str = ""
    channel_thumbnail: str = ""
    account_email: str = ""
    connected_at: str = ""
    has_playlist_scope: bool = False


class DriveAssetItem(BaseModel):
    file_id: str
    name: str
    mime_type: str = ""
    size_bytes: int = 0
    variant: str = ""
    preview_url: str = ""


class YouTubeUploadRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. EE01, SE08)")
    thumbnail_file_id: str = Field("", description="Selected Google Drive thumbnail file ID")
    playlist_id: str = Field("", description="Optional YouTube Playlist ID")
    playlist_title: str = Field("", description="Optional YouTube Playlist title")
    visibility_mode: str = Field("scheduled", description="scheduled | public | private")
    scheduled_date: str = Field("", description="YYYY-MM-DD in target timezone")
    scheduled_time: str = Field("", description="HH:MM (24h) in target timezone")
    timezone_name: str = Field("America/Bogota", description="IANA timezone (default America/Bogota)")
    title_override: Optional[str] = None
    description_override: Optional[str] = None


class YouTubeRetryThumbnailRequest(BaseModel):
    script_id: str = Field(..., description="Canonical ID (e.g. SE08)")
    video_id: str = Field(..., description="YouTube Video ID")
    thumbnail_file_id: str = Field(..., description="Google Drive thumbnail file ID")


class ApiResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[Any] = None
    error: Optional[str] = None


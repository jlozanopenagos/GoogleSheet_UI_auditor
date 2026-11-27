"""
youtube.py — REST API Router for Multi-Channel YouTube OAuth, Drive Asset Discovery & Short Uploads.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException, Path, Query, Request
# pyrefly: ignore[missing-import]
from fastapi.responses import HTMLResponse, Response

from ..core.config import settings
from ..core.routing import IdRoutingError, parse_and_route_id
from ..models.schemas import (
    ApiResponse,
    YouTubeRetryThumbnailRequest,
    YouTubeUploadRequest,
)
from ..services.calendar_service import calendar_service, normalize_launch_date
from ..services.drive_asset_service import DriveAssetError, drive_asset_service
from ..services.sheet_service import ScriptNotFoundError, SheetServiceError, sheet_service
from ..services.youtube_auth_service import YouTubeAuthError, youtube_auth_service
from ..services.youtube_upload_service import recommend_playlist_id, youtube_upload_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/youtube", tags=["YouTube Upload"])


@router.get("/auth/status", response_model=ApiResponse)
def get_youtube_auth_status() -> ApiResponse:
    """Returns OAuth connection status for the 4 YouTube channels and Google Drive."""
    return ApiResponse(
        success=True,
        message="YouTube and Google Drive authentication status loaded.",
        data=youtube_auth_service.get_all_statuses(),
    )


@router.post("/auth/start/{target}", response_model=ApiResponse)
def start_youtube_oauth(
    request: Request,
    target: str = Path(..., description="english | french | spanish | italian | drive"),
) -> ApiResponse:
    """Generates a Google OAuth 2.0 consent URL for the requested language channel or Drive."""
    redirect_uri = (settings.youtube_oauth_redirect_uri or "").strip()
    if not redirect_uri:
        redirect_uri = f"{str(request.base_url).rstrip('/')}/api/youtube/oauth/callback"

    try:
        data = youtube_auth_service.start_oauth_flow(target=target, redirect_uri=redirect_uri)
        return ApiResponse(
            success=True,
            message=f"OAuth URL generated for {data['target']}.",
            data=data,
        )
    except YouTubeAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"Unexpected error starting OAuth for {target}: {exc}")
        raise HTTPException(status_code=500, detail=f"OAuth initialization failed: {exc}")


@router.get("/oauth/callback", response_class=HTMLResponse)
def youtube_oauth_callback(
    state: str = Query("", description="OAuth CSRF state token"),
    code: str = Query("", description="Authorization code from Google"),
    error: str = Query("", description="Error returned by Google OAuth"),
) -> HTMLResponse:
    """Handles Google OAuth 2.0 redirect and notifies the opener tab via postMessage."""
    if error:
        payload = {"type": "youtube-oauth-complete", "success": False, "error": error}
        msg_html = f"<h2>Authorization cancelled or failed</h2><p>{error}</p>"
    elif not state or not code:
        payload = {"type": "youtube-oauth-complete", "success": False, "error": "Missing OAuth code or state."}
        msg_html = "<h2>Missing authorization code</h2><p>Please close this window and try again.</p>"
    else:
        try:
            status_info = youtube_auth_service.complete_oauth_callback(state=state, code=code)
            payload = {
                "type": "youtube-oauth-complete",
                "success": True,
                "target": status_info.get("target"),
                "channel_title": status_info.get("channel_title"),
            }
            label = status_info.get("channel_title") or status_info.get("target")
            msg_html = (
                f"<h2>Connected: {label}</h2>"
                "<p>You can close this window and return to GoogleSheet UI Auditor.</p>"
            )
        except Exception as exc:
            logger.exception(f"OAuth callback error: {exc}")
            payload = {"type": "youtube-oauth-complete", "success": False, "error": str(exc)}
            msg_html = f"<h2>Connection failed</h2><p>{exc}</p>"

    payload_json = json.dumps(payload)
    html = f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>YouTube OAuth</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f111a;color:#e6edf7;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;">
  <div style="max-width:420px;padding:24px;border:1px solid #2a3047;border-radius:16px;background:#171a27;">
    {msg_html}
  </div>
  <script>
    try {{
      if (window.opener) {{
        window.opener.postMessage({payload_json}, "*");
      }}
    }} catch (e) {{}}
    setTimeout(function() {{ window.close(); }}, 1200);
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.delete("/auth/{target}", response_model=ApiResponse)
def disconnect_youtube_target(
    target: str = Path(..., description="english | french | spanish | italian | drive"),
) -> ApiResponse:
    """Disconnects a stored YouTube channel or Google Drive OAuth token."""
    try:
        removed = youtube_auth_service.disconnect(target)
        return ApiResponse(
            success=True,
            message=f"Disconnected {target}." if removed else f"{target} was not connected.",
            data={"target": target.lower(), "disconnected": removed},
        )
    except YouTubeAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/preflight/{script_id}", response_model=ApiResponse)
def get_youtube_preflight(
    script_id: str = Path(..., description="Canonical ID e.g. EE01, SE08"),
) -> ApiResponse:
    """
    Loads Sheet metadata (Col J title, Col I description), Drive assets (`_videos terminados`),
    channel OAuth status, read-only Launch Calendar date suggestion, and prior upload record.
    """
    try:
        parsed = parse_and_route_id(script_id)
        record = sheet_service.fetch_script_by_id(parsed.canonical_id)
    except IdRoutingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except SheetServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    channel_status = youtube_auth_service.get_target_status(record.language)
    drive_status = youtube_auth_service.get_target_status("drive")

    drive_assets: Optional[Dict[str, Any]] = None
    drive_error = ""
    if drive_status["connected"]:
        try:
            drive_assets = drive_asset_service.list_script_assets(
                script_id=record.ID,
                language=record.language,
                video_type=record.video_type,
            )
        except DriveAssetError as exc:
            drive_error = str(exc)
        except Exception as exc:
            drive_error = f"Google Drive lookup failed: {exc}"

    # Read-only date suggestion from Launch Calendar or Column H video_date
    suggested_launch_date = ""
    cal_entry = calendar_service.get_entry(record.ID)
    if cal_entry and cal_entry.get("launch_date"):
        suggested_launch_date = str(cal_entry["launch_date"])
    elif record.video_date:
        try:
            iso_d, _ = normalize_launch_date(record.video_date)
            suggested_launch_date = iso_d
        except ValueError:
            suggested_launch_date = ""

    prior_upload = youtube_upload_service.get_upload_record(record.ID)

    playlists = []
    recommended_playlist_id = ""
    playlists_error = ""
    if channel_status["connected"]:
        try:
            playlists = youtube_upload_service.list_channel_playlists(record.language)
            recommended_playlist_id = recommend_playlist_id(
                playlists, record.language, record.video_type
            )
        except Exception as exc:
            playlists_error = f"Could not load playlists (reconnect channel to grant playlist access): {exc}"

    return ApiResponse(
        success=True,
        message=f"Preflight loaded for {record.ID}.",
        data={
            "record": record.model_dump(),
            "channel_status": channel_status,
            "drive_status": drive_status,
            "drive_assets": drive_assets,
            "drive_error": drive_error,
            "playlists": playlists,
            "recommended_playlist_id": recommended_playlist_id,
            "playlists_error": playlists_error,
            "suggested_launch_date": suggested_launch_date,
            "prior_upload": prior_upload,
        },
    )


@router.get("/drive-preview/{file_id}")
def get_drive_thumbnail_preview(file_id: str) -> Response:
    """Streams a Google Drive thumbnail image to the UI for side-by-side selection."""
    try:
        raw_bytes, mime_type = drive_asset_service.download_file_bytes(file_id)
        return Response(content=raw_bytes, media_type=mime_type)
    except YouTubeAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Could not load Drive preview: {exc}")


@router.post("/upload", response_model=ApiResponse)
def start_youtube_upload(payload: YouTubeUploadRequest) -> ApiResponse:
    """Starts an async YouTube Short upload + scheduled publish + custom thumbnail job."""
    try:
        parsed = parse_and_route_id(payload.script_id)
        record = sheet_service.fetch_script_by_id(parsed.canonical_id)
    except IdRoutingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except SheetServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    title = payload.title_override if payload.title_override is not None else record.short_title
    description = (
        payload.description_override if payload.description_override is not None else record.short_description
    )

    try:
        job = youtube_upload_service.start_upload_job(
            script_id=record.ID,
            title=title,
            description=description,
            visibility_mode=payload.visibility_mode,
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time,
            timezone_name=payload.timezone_name,
            thumbnail_file_id=payload.thumbnail_file_id,
            playlist_id=payload.playlist_id,
            playlist_title=payload.playlist_title,
        )
        return ApiResponse(
            success=True,
            message=f"YouTube upload job started for {record.ID}.",
            data=job,
        )
    except (ValueError, DriveAssetError, YouTubeAuthError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"Failed starting YouTube upload for {payload.script_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Upload initialization failed: {exc}")


@router.get("/jobs/{job_id}", response_model=ApiResponse)
def get_youtube_job_status(job_id: str) -> ApiResponse:
    """Returns live progress and status for a background YouTube upload job."""
    job = youtube_upload_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Upload job '{job_id}' not found.")
    return ApiResponse(
        success=True,
        message=job.get("message", ""),
        data=job,
    )


@router.post("/retry-thumbnail", response_model=ApiResponse)
def retry_youtube_thumbnail(payload: YouTubeRetryThumbnailRequest) -> ApiResponse:
    """Retries applying the selected custom thumbnail after YouTube processing finishes."""
    try:
        res = youtube_upload_service.retry_thumbnail(
            script_id=payload.script_id,
            video_id=payload.video_id,
            thumbnail_file_id=payload.thumbnail_file_id,
        )
        return ApiResponse(
            success=True,
            message=f"Custom thumbnail applied to {res['video_id']}.",
            data=res,
        )
    except (ValueError, IdRoutingError, YouTubeAuthError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"Retry thumbnail error: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to apply thumbnail: {exc}")


@router.get("/history", response_model=ApiResponse)
def list_youtube_upload_history() -> ApiResponse:
    """Lists locally recorded YouTube Shorts uploads."""
    return ApiResponse(
        success=True,
        message="YouTube upload history loaded.",
        data={"uploads": youtube_upload_service.list_upload_history()},
    )

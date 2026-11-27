"""
youtube_upload_service.py — YouTube Data API v3 Resumable Upload, Processing Poll,
Shorts Custom Thumbnail Application & Bogota -> UTC Scheduling Service.
"""

from __future__ import annotations

import json
import logging
import tempfile
import threading
import time
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..core.config import settings
from ..core.routing import parse_and_route_id
from .drive_asset_service import drive_asset_service
from .youtube_auth_service import youtube_auth_service

logger = logging.getLogger(__name__)

LANGUAGE_ISO_MAP: Dict[str, str] = {
    "english": "en",
    "french": "fr",
    "spanish": "es",
    "italian": "it",
}

DEFAULT_UPLOAD_HISTORY_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "youtube_uploads.json"
)


def _resolve_timezone(timezone_name: str) -> timezone | ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        if timezone_name == "America/Bogota":
            return timezone(timedelta(hours=-5))
        raise ValueError(f"Unknown timezone '{timezone_name}'.")


def convert_bogota_to_utc_iso(
    scheduled_date: str,
    scheduled_time: str,
    timezone_name: str = "America/Bogota",
    now_utc: Optional[datetime] = None,
) -> Tuple[str, str]:
    """
    Converts a local date (`YYYY-MM-DD`) and hour (`HH:MM`, 24h) in `timezone_name`
    (default `America/Bogota`, UTC-05:00) into `(utc_iso_z, local_display)`.
    Validates that the target instant is strictly in the future.
    """
    clean_date = str(scheduled_date or "").strip()
    clean_time = str(scheduled_time or "").strip()
    if not clean_date or not clean_time:
        raise ValueError("Scheduled date and launch hour are required when scheduling a YouTube upload.")

    try:
        naive_dt = datetime.strptime(f"{clean_date} {clean_time}", "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise ValueError(
            f"Invalid schedule format '{clean_date} {clean_time}'. Expected YYYY-MM-DD and HH:MM (24-hour)."
        ) from exc

    tz = _resolve_timezone(timezone_name)
    local_dt = naive_dt.replace(tzinfo=tz)
    utc_dt = local_dt.astimezone(timezone.utc)

    ref_now = now_utc or datetime.now(timezone.utc)
    if utc_dt <= ref_now:
        raise ValueError(
            f"Scheduled launch time ({clean_date} {clean_time} {timezone_name}) must be in the future."
        )

    utc_iso = utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    offset = local_dt.utcoffset() or timedelta(hours=-5)
    total_mins = int(offset.total_seconds() // 60)
    sign = "+" if total_mins >= 0 else "-"
    hh, mm = divmod(abs(total_mins), 60)
    local_display = f"{local_dt.strftime('%Y-%m-%d %H:%M')} {timezone_name} (UTC{sign}{hh:02d}:{mm:02d})"
    return utc_iso, local_display


def build_video_insert_body(
    title: str,
    description: str,
    language: str,
    visibility_mode: str = "scheduled",
    publish_at_utc: Optional[str] = None,
    category_id: str = "27",
) -> Dict[str, Any]:
    """
    Builds the YouTube Data API v3 `videos.insert` JSON body.
    Per YouTube docs, scheduled publishing MUST use `privacyStatus="private"` + `publishAt` (UTC ISO 8601);
    YouTube automatically flips the video to `public` at `publishAt`.
    """
    clean_title = (title or "").strip()
    clean_desc = (description or "").strip()
    if not clean_title:
        raise ValueError("Video title (Column J) cannot be empty.")
    if len(clean_title) > 100:
        raise ValueError(f"YouTube titles cannot exceed 100 characters (got {len(clean_title)}).")
    if not clean_desc:
        raise ValueError("Video description (Column I) cannot be empty.")

    mode = (visibility_mode or "scheduled").strip().lower()
    if mode not in ("scheduled", "public", "private"):
        raise ValueError(f"Unsupported visibility_mode '{visibility_mode}'.")

    lang_code = LANGUAGE_ISO_MAP.get((language or "english").strip().lower(), "en")

    status: Dict[str, Any] = {
        "selfDeclaredMadeForKids": False,
    }
    if mode == "scheduled":
        if not publish_at_utc:
            raise ValueError("publish_at_utc is required for scheduled uploads.")
        status["privacyStatus"] = "private"
        status["publishAt"] = publish_at_utc
    elif mode == "public":
        status["privacyStatus"] = "public"
    else:
        status["privacyStatus"] = "private"

    return {
        "snippet": {
            "title": clean_title,
            "description": clean_desc,
            "categoryId": str(category_id or "27"),
            "defaultLanguage": lang_code,
            "defaultAudioLanguage": lang_code,
        },
        "status": status,
    }


def _normalize_playlist_title(title: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(title or "").strip().lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def recommend_playlist_id(
    playlists: List[Dict[str, str]],
    language: str,
    video_type: str,
) -> str:
    """Finds the best matching YouTube playlist ID for the script's format."""
    _ = language  # Reserved for future per-language disambiguation
    vtype = str(video_type or "").strip().lower()
    for pl in playlists or []:
        pid = str(pl.get("playlist_id") or "").strip()
        if not pid:
            continue
        norm = _normalize_playlist_title(pl.get("title") or "")
        if vtype == "fun_facts" and "fun fact" in norm:
            return pid
        if vtype == "game" and ("trivia" in norm or "quiz" in norm):
            return pid
        if vtype == "roleplay" and any(
            kw in norm for kw in ("real life", "en action", "en accion", "in azione")
        ):
            return pid
        if vtype == "expression" and any(
            kw in norm
            for kw in (
                "idiom",
                "courantes",
                "comunes",
                "comuni",
                "modismos",
                "modi di dire",
                "everyday expression",
            )
        ):
            return pid
    return ""


class YouTubeUploadService:
    """Orchestrates Drive download, YouTube resumable upload, playlist assignment, processing poll, and custom thumbnail."""

    def __init__(self, history_path: Optional[Path] = None):
        self.history_path: Path = Path(history_path) if history_path else DEFAULT_UPLOAD_HISTORY_PATH
        self._lock = threading.RLock()
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._history: Dict[str, Dict[str, Any]] = {}
        self._load_history()

    def _load_history(self) -> None:
        with self._lock:
            if not self.history_path.is_file():
                self._history = {}
                return
            try:
                raw = json.loads(self.history_path.read_text(encoding="utf-8"))
                uploads = raw.get("uploads", {}) if isinstance(raw, dict) else {}
                self._history = uploads if isinstance(uploads, dict) else {}
            except Exception:
                self._history = {}

    def _save_history(self) -> None:
        with self._lock:
            self.history_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": "1.0",
                "uploads": {k: self._history[k] for k in sorted(self._history.keys())},
            }
            self.history_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    def get_upload_record(self, script_id: str) -> Optional[Dict[str, Any]]:
        cid = str(script_id or "").strip().upper()
        with self._lock:
            rec = self._history.get(cid)
            return dict(rec) if rec else None

    def list_upload_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            items = [dict(v) for v in self._history.values()]
        items.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
        return items

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _update_job(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(fields)

    def list_channel_playlists(
        self,
        language: str,
        youtube_client: Optional[Any] = None,
    ) -> List[Dict[str, str]]:
        """Lists playlists owned by the connected YouTube channel for `language`."""
        youtube = youtube_client or youtube_auth_service.build_youtube_client(language)
        resp = youtube.playlists().list(part="snippet", mine=True, maxResults=50).execute()
        items = resp.get("items") or []
        return [
            {
                "playlist_id": str(it.get("id") or ""),
                "title": str((it.get("snippet") or {}).get("title") or ""),
            }
            for it in items
            if it.get("id")
        ]

    def start_upload_job(
        self,
        script_id: str,
        title: str,
        description: str,
        visibility_mode: str,
        scheduled_date: str = "",
        scheduled_time: str = "",
        timezone_name: str = "America/Bogota",
        thumbnail_file_id: str = "",
        selected_video_file_id: str = "",
        playlist_id: str = "",
        playlist_title: str = "",
    ) -> Dict[str, Any]:
        parsed = parse_and_route_id(script_id)
        language = parsed.language
        video_type = parsed.video_type

        publish_at_utc: Optional[str] = None
        publish_at_bogota = ""
        if (visibility_mode or "scheduled").strip().lower() == "scheduled":
            publish_at_utc, publish_at_bogota = convert_bogota_to_utc_iso(
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                timezone_name=timezone_name or settings.youtube_default_timezone,
            )

        body = build_video_insert_body(
            title=title,
            description=description,
            language=language,
            visibility_mode=visibility_mode,
            publish_at_utc=publish_at_utc,
            category_id=settings.youtube_default_category_id,
        )

        # Verify YouTube + Drive auth & resolve Drive assets synchronously before spawning job
        channel_status = youtube_auth_service.get_target_status(language)
        if not channel_status["connected"]:
            raise ValueError(
                f"{language.capitalize()} YouTube channel is not connected. Connect it first in Tab 5."
            )
        drive_status = youtube_auth_service.get_target_status("drive")
        if not drive_status["connected"]:
            raise ValueError("Google Drive is not connected. Connect Google Drive first in Tab 5.")

        assets = drive_asset_service.list_script_assets(
            script_id=parsed.canonical_id,
            language=language,
            video_type=video_type,
        )
        video_asset = assets.get("video")
        if not video_asset:
            raise ValueError(
                f"No video (.mp4) found in Google Drive folder for {parsed.canonical_id}."
            )
        if selected_video_file_id and video_asset["file_id"] != selected_video_file_id:
            video_asset["file_id"] = selected_video_file_id

        thumbnails = assets.get("thumbnails") or []
        chosen_thumb: Optional[Dict[str, Any]] = None
        if len(thumbnails) > 1:
            if not thumbnail_file_id:
                raise ValueError(
                    "Multiple thumbnails exist for this ID (e.g. LatAm and Spain). Please select one before uploading."
                )
            chosen_thumb = next((t for t in thumbnails if t["file_id"] == thumbnail_file_id), None)
            if not chosen_thumb:
                raise ValueError("Selected thumbnail does not belong to this script's Drive folder.")
        elif len(thumbnails) == 1:
            chosen_thumb = thumbnails[0]
            if thumbnail_file_id and chosen_thumb["file_id"] != thumbnail_file_id:
                raise ValueError("Selected thumbnail was not found in this script's Drive folder.")

        clean_playlist_id = str(playlist_id or "").strip()
        clean_playlist_title = str(playlist_title or "").strip()

        job_id = str(uuid.uuid4())
        initial_job: Dict[str, Any] = {
            "job_id": job_id,
            "script_id": parsed.canonical_id,
            "language": language,
            "channel_title": channel_status.get("channel_title", ""),
            "stage": "queued",
            "progress_pct": 0,
            "message": "Queued for upload...",
            "video_id": "",
            "studio_url": "",
            "watch_url": "",
            "visibility_mode": visibility_mode,
            "publish_at_utc": publish_at_utc or "",
            "publish_at_bogota": publish_at_bogota,
            "playlist_id": clean_playlist_id,
            "playlist_title": clean_playlist_title,
            "playlist_added": False,
            "playlist_warning": "",
            "thumbnail_file_id": chosen_thumb["file_id"] if chosen_thumb else "",
            "thumbnail_variant": chosen_thumb["variant"] if chosen_thumb else "",
            "thumbnail_applied": False,
            "thumbnail_warning": "",
            "error": "",
        }
        with self._lock:
            self._jobs[job_id] = initial_job

        thread = threading.Thread(
            target=self._run_upload_job,
            kwargs={
                "job_id": job_id,
                "script_id": parsed.canonical_id,
                "language": language,
                "channel_title": channel_status.get("channel_title", ""),
                "body": body,
                "video_asset": video_asset,
                "chosen_thumb": chosen_thumb,
                "visibility_mode": visibility_mode,
                "publish_at_utc": publish_at_utc or "",
                "publish_at_bogota": publish_at_bogota,
                "playlist_id": clean_playlist_id,
                "playlist_title": clean_playlist_title,
            },
            daemon=True,
        )
        thread.start()
        return dict(initial_job)

    def _run_upload_job(
        self,
        job_id: str,
        script_id: str,
        language: str,
        channel_title: str,
        body: Dict[str, Any],
        video_asset: Dict[str, Any],
        chosen_thumb: Optional[Dict[str, Any]],
        visibility_mode: str,
        publish_at_utc: str,
        publish_at_bogota: str,
        playlist_id: str = "",
        playlist_title: str = "",
        youtube_client: Optional[Any] = None,
        drive_client: Optional[Any] = None,
        processing_timeout_sec: int = 90,
        poll_interval_sec: float = 3.0,
    ) -> None:
        try:
            drive = drive_client or youtube_auth_service.build_drive_client()
            youtube = youtube_client or youtube_auth_service.build_youtube_client(language)

            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
                tmp_path = Path(tmp_dir)
                media = None
                thumb_media = None
                try:
                    self._update_job(
                        job_id,
                        stage="downloading_drive",
                        progress_pct=10,
                        message=f"Downloading {video_asset['name']} from Google Drive...",
                    )
                    video_local = drive_asset_service.download_file_to_path(
                        video_asset["file_id"],
                        tmp_path / video_asset["name"],
                        drive_service=drive,
                    )

                    thumb_local: Optional[Path] = None
                    if chosen_thumb:
                        thumb_local = drive_asset_service.download_file_to_path(
                            chosen_thumb["file_id"],
                            tmp_path / chosen_thumb["name"],
                            drive_service=drive,
                        )

                    self._update_job(
                        job_id,
                        stage="uploading_video",
                        progress_pct=20,
                        message=f"Uploading Short to {channel_title or language.capitalize()}...",
                    )
                    # pyrefly: ignore[missing-import]
                    from googleapiclient.http import MediaFileUpload

                    media = MediaFileUpload(
                        str(video_local),
                        mimetype=video_asset.get("mime_type") or "video/mp4",
                        chunksize=4 * 1024 * 1024,
                        resumable=True,
                    )
                    insert_req = youtube.videos().insert(
                        part="snippet,status",
                        body=body,
                        media_body=media,
                    )

                    response = None
                    while response is None:
                        status_chunk, response = insert_req.next_chunk()
                        if status_chunk is not None:
                            pct = 20 + int(status_chunk.progress() * 55)
                            self._update_job(
                                job_id,
                                progress_pct=min(75, pct),
                                message=f"Uploading video ({int(status_chunk.progress() * 100)}%)...",
                            )

                    video_id = str((response or {}).get("id") or "")
                    if not video_id:
                        raise RuntimeError("YouTube API returned no video ID after upload.")

                    studio_url = f"https://studio.youtube.com/video/{video_id}/edit"
                    watch_url = f"https://youtube.com/shorts/{video_id}"

                    playlist_added = False
                    playlist_warning = ""
                    clean_playlist_id = str(playlist_id or "").strip()
                    clean_playlist_title = str(playlist_title or "").strip()
                    if clean_playlist_id:
                        self._update_job(
                            job_id,
                            video_id=video_id,
                            studio_url=studio_url,
                            watch_url=watch_url,
                            stage="adding_to_playlist",
                            progress_pct=78,
                            message=f"Adding Short to playlist '{clean_playlist_title or clean_playlist_id}'...",
                        )
                        try:
                            youtube.playlistItems().insert(
                                part="snippet",
                                body={
                                    "snippet": {
                                        "playlistId": clean_playlist_id,
                                        "resourceId": {
                                            "kind": "youtube#video",
                                            "videoId": video_id,
                                        },
                                    }
                                },
                            ).execute()
                            playlist_added = True
                        except Exception as pl_exc:
                            logger.warning(
                                f"Uploaded video {video_id} ({script_id}), but failed adding to playlist '{clean_playlist_id}': {pl_exc}"
                            )
                            playlist_warning = f"Video uploaded, but could not add to playlist: {pl_exc}"

                    self._update_job(
                        job_id,
                        video_id=video_id,
                        studio_url=studio_url,
                        watch_url=watch_url,
                        playlist_id=clean_playlist_id,
                        playlist_title=clean_playlist_title,
                        playlist_added=playlist_added,
                        playlist_warning=playlist_warning,
                        stage="waiting_processing",
                        progress_pct=80,
                        message="Waiting for YouTube processing before applying custom thumbnail...",
                    )

                    thumbnail_applied = False
                    thumbnail_warning = ""
                    if thumb_local is not None:
                        processed = self._wait_for_processing(
                            youtube,
                            video_id,
                            timeout_sec=processing_timeout_sec,
                            poll_interval_sec=poll_interval_sec,
                        )
                        if processed:
                            self._update_job(
                                job_id,
                                stage="setting_thumbnail",
                                progress_pct=92,
                                message="Applying custom thumbnail...",
                            )
                            thumb_media = MediaFileUpload(
                                str(thumb_local),
                                mimetype=chosen_thumb.get("mime_type") if chosen_thumb else "image/png",
                            )
                            youtube.thumbnails().set(
                                videoId=video_id,
                                media_body=thumb_media,
                            ).execute()
                            thumbnail_applied = True
                        else:
                            thumbnail_warning = (
                                "Video uploaded, but YouTube processing took longer than 90s. "
                                "Click 'Retry Thumbnail' in a moment to apply the custom thumbnail."
                            )

                    record = {
                        "script_id": script_id,
                        "video_id": video_id,
                        "studio_url": studio_url,
                        "watch_url": watch_url,
                        "language": language,
                        "channel_title": channel_title,
                        "title": body["snippet"]["title"],
                        "visibility_mode": visibility_mode,
                        "publish_at_utc": publish_at_utc,
                        "publish_at_bogota": publish_at_bogota,
                        "playlist_id": clean_playlist_id,
                        "playlist_title": clean_playlist_title,
                        "playlist_added": playlist_added,
                        "thumbnail_file_id": chosen_thumb["file_id"] if chosen_thumb else "",
                        "thumbnail_variant": chosen_thumb["variant"] if chosen_thumb else "",
                        "thumbnail_applied": thumbnail_applied,
                        "uploaded_at": datetime.now(timezone.utc).isoformat(),
                    }
                    with self._lock:
                        self._history[script_id] = record
                        self._save_history()

                    completion_message = thumbnail_warning or playlist_warning or "Upload complete!"
                    self._update_job(
                        job_id,
                        stage="completed",
                        progress_pct=100,
                        playlist_id=clean_playlist_id,
                        playlist_title=clean_playlist_title,
                        playlist_added=playlist_added,
                        playlist_warning=playlist_warning,
                        thumbnail_applied=thumbnail_applied,
                        thumbnail_warning=thumbnail_warning,
                        message=completion_message,
                    )
                finally:
                    # Explicitly release Windows file handles held by MediaFileUpload before temp dir cleanup
                    for m in (media, thumb_media):
                        if m is not None and hasattr(m, "stream"):
                            try:
                                stream = m.stream()
                                if stream is not None:
                                    stream.close()
                            except Exception:
                                pass
        except Exception as exc:
            logger.exception(f"YouTube upload job {job_id} ({script_id}) failed: {exc}")
            self._update_job(
                job_id,
                stage="failed",
                error=str(exc),
                message=f"Upload failed: {exc}",
            )

    @staticmethod
    def _wait_for_processing(
        youtube: Any,
        video_id: str,
        timeout_sec: int = 90,
        poll_interval_sec: float = 3.0,
    ) -> bool:
        deadline = time.monotonic() + timeout_sec
        while True:
            resp = youtube.videos().list(part="processingDetails", id=video_id).execute()
            items = resp.get("items") or []
            if items:
                proc = items[0].get("processingDetails") or {}
                status = str(proc.get("processingStatus") or "").lower()
                if status == "succeeded":
                    return True
                if status in ("failed", "terminated"):
                    return False
            if time.monotonic() >= deadline:
                return False
            time.sleep(poll_interval_sec)

    def retry_thumbnail(
        self,
        script_id: str,
        video_id: str,
        thumbnail_file_id: str,
        youtube_client: Optional[Any] = None,
        drive_client: Optional[Any] = None,
    ) -> Dict[str, Any]:
        parsed = parse_and_route_id(script_id)
        drive = drive_client or youtube_auth_service.build_drive_client()
        youtube = youtube_client or youtube_auth_service.build_youtube_client(parsed.language)

        ready = self._wait_for_processing(youtube, video_id, timeout_sec=15, poll_interval_sec=2.0)
        if not ready:
            raise ValueError(
                "YouTube is still processing this video. Wait a few seconds and click Retry Thumbnail again."
            )

        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
            dest = Path(tmp_dir) / f"{parsed.canonical_id}_thumb.png"
            drive_asset_service.download_file_to_path(thumbnail_file_id, dest, drive_service=drive)
            # pyrefly: ignore[missing-import]
            from googleapiclient.http import MediaFileUpload
            thumb_media = MediaFileUpload(str(dest), mimetype="image/png")
            try:
                youtube.thumbnails().set(
                    videoId=video_id,
                    media_body=thumb_media,
                ).execute()
            finally:
                if hasattr(thumb_media, "stream"):
                    try:
                        stream = thumb_media.stream()
                        if stream is not None:
                            stream.close()
                    except Exception:
                        pass

        with self._lock:
            if parsed.canonical_id in self._history:
                self._history[parsed.canonical_id]["thumbnail_applied"] = True
                self._save_history()

        return {"script_id": parsed.canonical_id, "video_id": video_id, "thumbnail_applied": True}


youtube_upload_service = YouTubeUploadService()

"""
drive_asset_service.py — Google Drive Asset Discovery & Streaming for `_videos terminados`.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..core.config import settings
from .youtube_auth_service import youtube_auth_service

logger = logging.getLogger(__name__)

DRIVE_VIDEO_TYPE_FOLDER_MAP: Dict[str, str] = {
    "expression": "expressions",
    "expressions": "expressions",
    "fun_facts": "fun_facts",
    "funfacts": "fun_facts",
    "facts": "fun_facts",
    "game": "game",
    "games": "game",
    "quiz": "game",
    "roleplay": "role_play",
    "role_play": "role_play",
}

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v")


class DriveAssetError(Exception):
    """Raised when Google Drive folder navigation or asset retrieval fails."""
    pass


def map_video_type_to_drive_folder(video_type: str) -> str:
    clean = (video_type or "expression").strip().lower()
    return DRIVE_VIDEO_TYPE_FOLDER_MAP.get(clean, clean)


def detect_thumbnail_variant(filename: str) -> str:
    lower = (filename or "").lower()
    if "latam" in lower:
        return "latam"
    if "spain" in lower or "espana" in lower or "españa" in lower:
        return "spain"
    return "default"


class DriveAssetService:
    """Locates and streams finished Short videos and thumbnails from Google Drive."""

    @staticmethod
    def _escape_query(value: str) -> str:
        return value.replace("\\", "\\\\").replace("'", "\\'")

    def _find_child_folder(
        self,
        drive: Any,
        parent_id: str,
        folder_name: str,
    ) -> Optional[str]:
        query = (
            f"mimeType = 'application/vnd.google-apps.folder' "
            f"and '{self._escape_query(parent_id)}' in parents and trashed = false"
        )
        resp = (
            drive.files()
            .list(
                q=query,
                fields="files(id, name)",
                pageSize=200,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        target_lower = folder_name.strip().lower()
        for item in resp.get("files") or []:
            if str(item.get("name") or "").strip().lower() == target_lower:
                return str(item["id"])
        return None

    def resolve_root_folder_id(self, drive: Any) -> str:
        configured = (settings.google_drive_root_folder_id or "").strip()
        if configured:
            return configured

        root_name = (settings.google_drive_root_folder_name or "_videos terminados").strip()
        query = (
            f"mimeType = 'application/vnd.google-apps.folder' "
            f"and name = '{self._escape_query(root_name)}' and trashed = false"
        )
        resp = (
            drive.files()
            .list(
                q=query,
                fields="files(id, name)",
                pageSize=10,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files = resp.get("files") or []
        if not files:
            raise DriveAssetError(
                f"Could not find Google Drive folder '{root_name}'. "
                "Set GOOGLE_DRIVE_ROOT_FOLDER_ID in .env or verify Drive account permissions."
            )
        return str(files[0]["id"])

    def list_script_assets(
        self,
        script_id: str,
        language: str,
        video_type: str,
        drive_service: Optional[Any] = None,
    ) -> Dict[str, Any]:
        drive = drive_service or youtube_auth_service.build_drive_client()
        canonical_id = script_id.strip().upper()
        lang_folder = language.strip().lower()
        vtype_folder = map_video_type_to_drive_folder(video_type)

        root_id = self.resolve_root_folder_id(drive)

        lang_id = self._find_child_folder(drive, root_id, lang_folder)
        if not lang_id:
            raise DriveAssetError(
                f"Language folder '{lang_folder}' not found inside '{settings.google_drive_root_folder_name}'."
            )

        vtype_id = self._find_child_folder(drive, lang_id, vtype_folder)
        if not vtype_id:
            raise DriveAssetError(
                f"Video type folder '{vtype_folder}' not found inside '{lang_folder}'."
            )

        script_folder_id = self._find_child_folder(drive, vtype_id, canonical_id)
        if not script_folder_id:
            raise DriveAssetError(
                f"Script folder '{canonical_id}' not found under "
                f"'{settings.google_drive_root_folder_name}/{lang_folder}/{vtype_folder}'."
            )

        query = f"'{self._escape_query(script_folder_id)}' in parents and trashed = false"
        resp = (
            drive.files()
            .list(
                q=query,
                fields="files(id, name, mimeType, size)",
                pageSize=50,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        raw_files = resp.get("files") or []

        videos: List[Dict[str, Any]] = []
        thumbnails: List[Dict[str, Any]] = []

        for f in raw_files:
            fname = str(f.get("name") or "")
            lower = fname.lower()
            mime = str(f.get("mimeType") or "")
            fid = str(f.get("id") or "")
            size_bytes = int(f.get("size") or 0)

            if lower.endswith(VIDEO_EXTENSIONS) or mime.startswith("video/"):
                videos.append({
                    "file_id": fid,
                    "name": fname,
                    "mime_type": mime or "video/mp4",
                    "size_bytes": size_bytes,
                    "variant": "video",
                    "preview_url": "",
                })
            elif lower.endswith(IMAGE_EXTENSIONS) or mime.startswith("image/"):
                variant = detect_thumbnail_variant(fname)
                thumbnails.append({
                    "file_id": fid,
                    "name": fname,
                    "mime_type": mime or "image/png",
                    "size_bytes": size_bytes,
                    "variant": variant,
                    "preview_url": f"/api/youtube/drive-preview/{fid}",
                })

        # Prefer exact <ID>.mp4 if multiple video files exist
        preferred_video_name = f"{canonical_id.lower()}.mp4"
        videos.sort(key=lambda v: (0 if v["name"].lower() == preferred_video_name else 1, v["name"].lower()))
        primary_video = videos[0] if videos else None

        # Sort thumbnails cleanly: latam -> spain -> default/other
        variant_order = {"latam": 0, "spain": 1, "default": 2}
        thumbnails.sort(key=lambda t: (variant_order.get(t["variant"], 9), t["name"].lower()))

        return {
            "folder_id": script_folder_id,
            "folder_url": f"https://drive.google.com/drive/folders/{script_folder_id}",
            "video": primary_video,
            "thumbnails": thumbnails,
            "requires_thumbnail_choice": len(thumbnails) > 1,
        }

    def download_file_bytes(
        self,
        file_id: str,
        drive_service: Optional[Any] = None,
    ) -> Tuple[bytes, str]:
        # pyrefly: ignore[missing-import]
        from googleapiclient.http import MediaIoBaseDownload

        drive = drive_service or youtube_auth_service.build_drive_client()
        meta = drive.files().get(fileId=file_id, fields="name, mimeType", supportsAllDrives=True).execute()
        mime_type = str(meta.get("mimeType") or "image/png")

        request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buf.getvalue(), mime_type

    def download_file_to_path(
        self,
        file_id: str,
        dest_path: Path,
        drive_service: Optional[Any] = None,
    ) -> Path:
        # pyrefly: ignore[missing-import]
        from googleapiclient.http import MediaIoBaseDownload

        drive = drive_service or youtube_auth_service.build_drive_client()
        request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with dest_path.open("wb") as fh:
            downloader = MediaIoBaseDownload(fh, request, chunksize=4 * 1024 * 1024)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        return dest_path


drive_asset_service = DriveAssetService()

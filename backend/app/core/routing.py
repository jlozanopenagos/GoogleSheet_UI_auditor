"""
routing.py — Canonical ID Parsing & Google Sheet Target Resolver (Single Responsibility)
"""

from __future__ import annotations

import re
from typing import Dict, Tuple, Optional
# pyrefly: ignore[missing-import]
from pydantic import BaseModel
from .config import ENDPOINT_REGISTRY, extract_spreadsheet_id, extract_gid


LANG_MAP: Dict[str, str] = {
    "E": "english",
    "F": "french",
    "S": "spanish",
    "I": "italian",
}

TYPE_MAP: Dict[str, str] = {
    "E": "expression",
    "G": "game",
    "R": "roleplay",
    "F": "fun_facts",
}


class ParsedId(BaseModel):
    raw_id: str
    canonical_id: str
    language: str
    video_type: str
    index: int
    spreadsheet_id: str
    gid: Optional[str] = None
    sheet_url: str


class IdRoutingError(ValueError):
    """Raised when an ID cannot be parsed or routed to a known sheet."""
    pass


def parse_and_route_id(raw_id: str) -> ParsedId:
    """
    Parses a canonical ID (e.g. 'EE01', 'FG04', 'SR10') and resolves its Google Sheet location.
    
    Raises:
        IdRoutingError: If ID format is invalid or no spreadsheet is configured for that combination.
    """
    if not raw_id or not isinstance(raw_id, str):
        raise IdRoutingError("Script ID cannot be empty.")

    clean_id = raw_id.strip().upper()
    match = re.match(r"^([EFSI])([EGRF])(\d{1,3})$", clean_id)
    if not match:
        raise IdRoutingError(
            f"Invalid ID format '{clean_id}'. Canonical format must be <Lang><Type><Index> "
            f"(e.g. EE01, FG03, SR12). Valid prefixes: E, F, S, I with E, G, R, F."
        )

    lang_code = match.group(1)
    type_code = match.group(2)
    index_str = match.group(3)

    language = LANG_MAP.get(lang_code)
    video_type = TYPE_MAP.get(type_code)

    if not language or not video_type:
        raise IdRoutingError(f"Unrecognized language or video type in ID '{clean_id}'.")

    # Canonical formatted ID (e.g. EE01)
    index_num = int(index_str)
    canonical_id = f"{lang_code}{type_code}{index_num:02d}"

    # Lookup spreadsheet endpoint
    endpoint_url = ENDPOINT_REGISTRY.get((language, video_type), "")
    if not endpoint_url:
        raise IdRoutingError(
            f"No Google Sheet endpoint configured for {language.capitalize()} {video_type.replace('_', ' ').capitalize()} ({canonical_id}). "
            f"Please check SHEETS_ENDPOINT_{language.upper()}_{video_type.upper()} in .env."
        )

    spreadsheet_id = extract_spreadsheet_id(endpoint_url)
    if not spreadsheet_id:
        raise IdRoutingError(
            f"Could not extract spreadsheet ID from endpoint URL: {endpoint_url}"
        )

    gid = extract_gid(endpoint_url)

    return ParsedId(
        raw_id=clean_id,
        canonical_id=canonical_id,
        language=language,
        video_type=video_type,
        index=index_num,
        spreadsheet_id=spreadsheet_id,
        gid=gid,
        sheet_url=endpoint_url
    )


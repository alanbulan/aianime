"""Freezone video character library persistence."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_anime.freezone.paths import freezone_root


def video_character_library_path(project_dir: Path) -> Path:
    return freezone_root(project_dir) / "video_character_library.json"


def load_video_character_library(project_dir: Path) -> list[dict[str, Any]]:
    path = video_character_library_path(project_dir)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def save_video_character_library(
    project_dir: Path, items: list[dict[str, Any]]
) -> None:
    path = video_character_library_path(project_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _upsert_library_item(
    items: list[dict[str, Any]],
    *,
    name: str,
    image_urls: list[str] | None,
    media: str,
    source: str,
    video_url: str | None,
    audio_url: str | None,
    item_id: str | None,
) -> dict[str, Any]:
    """Upsert one in-memory item and return the stored value."""
    now = datetime.now().isoformat()
    urls = list(image_urls or [])
    if media == "video":
        cover = video_url
    elif media == "audio":
        cover = None
    else:
        cover = urls[0] if urls else None
    resolved_id = item_id or uuid.uuid4().hex[:12]
    existing_idx = next(
        (index for index, item in enumerate(items) if item.get("id") == resolved_id),
        None,
    )
    existing = items[existing_idx] if existing_idx is not None else None
    item = {
        "id": resolved_id,
        "name": name.strip(),
        "media": media,
        "source": source,
        "image_urls": urls,
        "video_url": video_url,
        "audio_url": audio_url,
        "cover_url": cover,
        "created_at": existing.get("created_at") if existing else now,
        "updated_at": now,
    }
    if existing_idx is not None:
        items[existing_idx] = item
    else:
        items.append(item)
    return item


def add_video_character_library_item(
    project_dir: Path,
    *,
    name: str,
    image_urls: list[str] | None = None,
    media: str = "image",
    source: str = "upload",
    video_url: str | None = None,
    audio_url: str | None = None,
    item_id: str | None = None,
) -> dict[str, Any]:
    items = load_video_character_library(project_dir)
    item = _upsert_library_item(
        items,
        name=name,
        image_urls=image_urls,
        media=media,
        source=source,
        video_url=video_url,
        audio_url=audio_url,
        item_id=item_id,
    )
    save_video_character_library(project_dir, items)
    return item


def delete_video_character_library_item(project_dir: Path, item_id: str) -> bool:
    items = load_video_character_library(project_dir)
    kept = [item for item in items if item.get("id") != item_id]
    if len(kept) == len(items):
        return False
    save_video_character_library(project_dir, kept)
    return True


def sync_mainline_assets_into_library(
    project_dir: Path,
    *,
    assets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    items = load_video_character_library(project_dir)
    changed = False
    for asset in assets:
        media = str(asset.get("media") or "image")
        url = asset.get("url") or ""
        if not url:
            continue
        _upsert_library_item(
            items,
            name=str(asset.get("name") or ""),
            media=media,
            source=str(asset.get("source") or "upload"),
            item_id=str(asset.get("id") or "") or None,
            image_urls=[url] if media == "image" else None,
            video_url=url if media == "video" else None,
            audio_url=url if media == "audio" else None,
        )
        changed = True
    if changed:
        save_video_character_library(project_dir, items)
    return items

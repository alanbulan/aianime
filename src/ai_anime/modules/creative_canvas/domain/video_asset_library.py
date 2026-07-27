"""Creative Canvas video asset library domain rules."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any


def upsert_video_asset_library_item(
    items: Iterable[Mapping[str, Any]],
    *,
    item_id: str,
    name: str,
    media: str,
    source: str,
    image_urls: Sequence[str] | None,
    video_url: str | None,
    audio_url: str | None,
    updated_at: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return a new collection with one item inserted or replaced by stable id."""
    stored_items = [dict(item) for item in items]
    existing_index = next(
        (
            index
            for index, item in enumerate(stored_items)
            if item.get("id") == item_id
        ),
        None,
    )
    existing = stored_items[existing_index] if existing_index is not None else None
    urls = list(image_urls or ())
    if media == "video":
        cover_url = video_url
    elif media == "audio":
        cover_url = None
    else:
        cover_url = urls[0] if urls else None

    item = {
        "id": item_id,
        "name": name.strip(),
        "media": media,
        "source": source,
        "image_urls": urls,
        "video_url": video_url,
        "audio_url": audio_url,
        "cover_url": cover_url,
        "created_at": existing.get("created_at") if existing else updated_at,
        "updated_at": updated_at,
    }
    if existing_index is None:
        stored_items.append(item)
    else:
        stored_items[existing_index] = item
    return stored_items, item


def delete_video_asset_library_item(
    items: Iterable[Mapping[str, Any]],
    item_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    stored_items = [dict(item) for item in items]
    kept = [item for item in stored_items if item.get("id") != item_id]
    return kept, len(kept) != len(stored_items)


__all__ = [
    "delete_video_asset_library_item",
    "upsert_video_asset_library_item",
]

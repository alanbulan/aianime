"""Creative Canvas preset identity rules."""

from __future__ import annotations

import hashlib
import re


def safe_creative_canvas_identifier_fragment(
    value: str,
    fallback: str = "item",
) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_\-]+", "_", value).strip("_")
    if safe:
        return safe[:48]
    return f"{fallback}_{hashlib.sha1(value.encode('utf-8')).hexdigest()[:10]}"


def preset_key_for_request(
    *,
    scope: str,
    episode: int | None = None,
    beat: int | None = None,
    primary_slot: str | None = None,
    asset_kind: str | None = None,
    character: str | None = None,
    identity_id: str | None = None,
    asset_id: str | None = None,
) -> str:
    if scope == "episode":
        if episode is None:
            raise ValueError("episode preset requires episode")
        return f"episode:ep{episode:03d}"
    if scope == "beat":
        if episode is None or beat is None:
            raise ValueError("beat preset requires episode and beat")
        slot = primary_slot or "render"
        return f"beat:ep{episode:03d}:beat{beat:03d}:{slot}"
    if scope == "asset":
        parts = [
            "asset",
            asset_kind or "unknown",
            character or "",
            identity_id or "",
            asset_id or "",
        ]
        return ":".join(parts)
    return "blank"


def canvas_id_for_preset(preset_key: str) -> str:
    digest = hashlib.sha1(preset_key.encode("utf-8")).hexdigest()[:8]
    stem = safe_creative_canvas_identifier_fragment(
        preset_key.replace(":", "_"),
        fallback="preset",
    )
    return f"{stem[:50]}_{digest}"[:64]

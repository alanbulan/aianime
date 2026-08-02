"""History, deletion, and idempotency persistence for Creative Canvas."""

from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasHistoryNotFound,
    CanvasInvalidHistoryId,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_io import (
    atomic_write_json,
    load_canvas_json,
    parse_canvas_iso,
    timestamp_utc_iso,
    utc_iso,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import canvas_path

CANVAS_HISTORY_TS_FORMAT = "%Y%m%d_%H%M%S_%f"
HISTORY_RETENTION_LIMIT = 100
IDEMPOTENCY_LIMIT = 50
IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60


def canvas_history_dir_for_path(path: Path) -> Path:
    return path.parent / "_history"


def canvas_deleted_dir_for_path(path: Path) -> Path:
    return path.parent / "_deleted" / path.stem


def canvas_idempotency_dir(project_dir: Path) -> Path:
    return project_dir / "freezone" / "canvas_idempotency"


def canvas_idempotency_path(project_dir: Path, canvas_id: str) -> Path:
    return canvas_idempotency_dir(project_dir) / f"{canvas_id}.json"


def canvas_history_filename(
    path: Path,
    existing: dict | None,
    *,
    now: datetime | None = None,
) -> str:
    revision = existing.get("revision") if isinstance(existing, dict) else None
    revision_text = f"rev{revision}" if isinstance(revision, int) else "rev_unknown"
    timestamp = (now or datetime.now()).strftime(CANVAS_HISTORY_TS_FORMAT)
    return f"{path.stem}.{revision_text}.{timestamp}.json"


def canvas_deleted_filename(
    existing: dict | None,
    *,
    now: datetime | None = None,
) -> str:
    revision = existing.get("revision") if isinstance(existing, dict) else None
    revision_text = f"rev{revision}" if isinstance(revision, int) else "rev_unknown"
    timestamp = (now or datetime.now()).strftime(CANVAS_HISTORY_TS_FORMAT)
    return f"{timestamp}_{revision_text}.json"


def backup_canvas_snapshot(path: Path, existing: dict | None) -> Path | None:
    if not path.exists():
        return None
    history_dir = canvas_history_dir_for_path(path)
    history_dir.mkdir(parents=True, exist_ok=True)
    target = history_dir / canvas_history_filename(path, existing)
    shutil.copy2(path, target)
    return target


def load_canvas_idempotency(project_dir: Path, canvas_id: str) -> dict:
    path = canvas_idempotency_path(project_dir, canvas_id)
    payload = load_canvas_json(path)
    if not isinstance(payload, dict):
        return {"canvas_id": canvas_id, "entries": []}
    entries = payload.get("entries")
    if not isinstance(entries, list):
        payload["entries"] = []
    payload["canvas_id"] = canvas_id
    return payload


def _entry_is_fresh(entry: dict, *, now: datetime) -> bool:
    accepted_at = entry.get("accepted_at")
    if not isinstance(accepted_at, str):
        return False
    try:
        accepted = parse_canvas_iso(accepted_at)
    except ValueError:
        return False
    comparable_now = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    return (
        comparable_now.astimezone(timezone.utc) - accepted
    ).total_seconds() <= IDEMPOTENCY_TTL_SECONDS


def prune_idempotency_entries(entries: list, *, now: datetime) -> list[dict]:
    fresh = [
        entry
        for entry in entries
        if isinstance(entry, dict) and _entry_is_fresh(entry, now=now)
    ]
    fresh.sort(key=lambda entry: str(entry.get("accepted_at") or ""), reverse=True)
    return fresh[:IDEMPOTENCY_LIMIT]


def find_idempotency_entry(
    project_dir: Path,
    canvas_id: str,
    client_save_id: str,
) -> dict | None:
    now = datetime.now(timezone.utc)
    payload = load_canvas_idempotency(project_dir, canvas_id)
    for entry in prune_idempotency_entries(payload.get("entries") or [], now=now):
        if entry.get("client_save_id") == client_save_id:
            return entry
    return None


def append_idempotency_entry(
    project_dir: Path,
    canvas_id: str,
    *,
    client_save_id: str,
    revision: int | None,
    request_hash: str | None,
    response_cache: dict,
) -> None:
    now = datetime.now(timezone.utc)
    payload = load_canvas_idempotency(project_dir, canvas_id)
    entries = [
        entry
        for entry in prune_idempotency_entries(payload.get("entries") or [], now=now)
        if entry.get("client_save_id") != client_save_id
    ]
    entries.insert(
        0,
        {
            "client_save_id": client_save_id,
            "revision": revision,
            "request_hash": request_hash,
            "accepted_at": utc_iso(now),
            "response_cache": response_cache,
        },
    )
    payload = {"canvas_id": canvas_id, "entries": entries[:IDEMPOTENCY_LIMIT]}
    atomic_write_json(canvas_idempotency_path(project_dir, canvas_id), payload)


def canvas_history_pattern(canvas_id: str) -> re.Pattern[str]:
    return re.compile(
        rf"^{re.escape(canvas_id)}\.rev(?P<revision>\d+|unknown)\."
        rf"(?P<timestamp>\d{{8}}_\d{{6}}_\d{{6}})\.json$"
    )


def history_id_from_path(path: Path) -> str:
    return path.name.removesuffix(".json")


def resolve_canvas_history_file(
    project_dir: Path,
    canvas_id: str,
    history_id: str,
) -> Path:
    raw = str(history_id or "").strip()
    if not raw or "/" in raw or "\\" in raw or ".." in raw:
        raise CanvasInvalidHistoryId()
    filename = raw if raw.endswith(".json") else f"{raw}.json"
    if not canvas_history_pattern(canvas_id).match(filename):
        raise CanvasInvalidHistoryId()
    history_dir = canvas_history_dir_for_path(
        canvas_path(project_dir, canvas_id)
    ).resolve()
    candidate = (history_dir / filename).resolve()
    try:
        candidate.relative_to(history_dir)
    except ValueError as exc:
        raise CanvasInvalidHistoryId() from exc
    if not candidate.exists():
        raise CanvasHistoryNotFound()
    return candidate


def canvas_history_entry(path: Path, canvas_id: str) -> dict | None:
    match = canvas_history_pattern(canvas_id).match(path.name)
    if not match:
        return None
    payload = load_canvas_json(path) or {}
    revision_text = match.group("revision")
    timestamp_text = match.group("timestamp")
    try:
        created_at = utc_iso(
            datetime.strptime(timestamp_text, CANVAS_HISTORY_TS_FORMAT)
        )
    except ValueError:
        created_at = timestamp_utc_iso(path.stat().st_mtime)
    revision = int(revision_text) if revision_text.isdigit() else None
    return {
        "history_id": history_id_from_path(path),
        "filename": path.name,
        "revision": revision,
        "created_at": created_at,
        "node_count": len(payload.get("nodes") or []),
        "edge_count": len(payload.get("edges") or []),
        "size": path.stat().st_size,
    }


def list_canvas_history(project_dir: Path, canvas_id: str) -> list[dict]:
    history_dir = canvas_history_dir_for_path(canvas_path(project_dir, canvas_id))
    if not history_dir.exists():
        return []
    entries = [
        entry
        for path in history_dir.glob(f"{canvas_id}.rev*.json")
        if (entry := canvas_history_entry(path, canvas_id)) is not None
    ]
    entries.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    return entries


def prune_canvas_history(
    project_dir: Path,
    canvas_id: str,
    *,
    keep: int = HISTORY_RETENTION_LIMIT,
) -> None:
    history_dir = canvas_history_dir_for_path(canvas_path(project_dir, canvas_id))
    if keep <= 0 or not history_dir.exists():
        return
    files = [
        path
        for path in history_dir.glob(f"{canvas_id}.rev*.json")
        if canvas_history_pattern(canvas_id).match(path.name)
    ]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    for stale in files[keep:]:
        stale.unlink(missing_ok=True)

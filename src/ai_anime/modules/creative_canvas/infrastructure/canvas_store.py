"""Transactional file-backed storage for Creative Canvas documents."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Callable

from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import (
    canvas_write_lock,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasBaseRevisionRequired,
    CanvasDeleteResult,
    CanvasEnsureResult,
    CanvasIdempotencyConflict,
    CanvasRestoreResult,
    CanvasRevisionConflict,
    CanvasSaveResult,
    CanvasStoreError,
    DangerousEmptyCanvasOverwrite,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_history import (
    append_idempotency_entry,
    backup_canvas_snapshot,
    canvas_deleted_dir_for_path,
    canvas_deleted_filename,
    canvas_idempotency_path,
    find_idempotency_entry,
    prune_canvas_history,
    resolve_canvas_history_file,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_io import (
    atomic_write_json,
    canvas_payload_size_warning,
    load_canvas_json,
    relative_project_path,
    timestamp_utc_iso,
    utc_iso,
    utc_now_iso,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import (
    canvas_path,
    canvases_dir,
)


def default_canvas_payload(
    *,
    project_id: str,
    actor_id: str = "",
    now: datetime | None = None,
) -> dict:
    timestamp = utc_iso(now) if now is not None else utc_now_iso()
    actor = str(actor_id or "")
    return {
        "schema_version": 2,
        "canvas_id": "default",
        "project_id": project_id,
        "canvas_scope": "default",
        "revision": 1,
        "nodes": [],
        "edges": [],
        "viewport": None,
        "metadata": None,
        "owner_principal_type": "user",
        "owner_principal_id": actor,
        "access_model": "project_role",
        "min_project_role": "editor",
        "created_by": actor,
        "created_at": timestamp,
        "updated_by": actor,
        "updated_at": timestamp,
        "save_source": "system_default",
    }


def ensure_default_canvas(
    project_dir: Path,
    *,
    project_id: str,
    actor_id: str = "",
) -> CanvasEnsureResult:
    with canvas_write_lock(project_dir, "default"):
        path = canvas_path(project_dir, "default")
        existing = load_canvas_json(path)
        if isinstance(existing, dict):
            return CanvasEnsureResult(payload=existing, created=False)
        tombstone = path.with_name("default.deleted.json")
        deleted = load_canvas_json(tombstone)
        if isinstance(deleted, dict):
            return CanvasEnsureResult(payload=deleted, created=False)
        payload = default_canvas_payload(project_id=project_id, actor_id=actor_id)
        atomic_write_json(path, payload)
        return CanvasEnsureResult(payload=payload, created=True)


def list_canvases(project_dir: Path) -> list[dict]:
    target = canvases_dir(project_dir)
    if not target.exists():
        return []
    items: list[dict] = []
    for path in target.glob("*.json"):
        if path.name.endswith(".deleted.json"):
            continue
        payload = load_canvas_json(path) or {}
        metadata = (
            payload.get("metadata")
            if isinstance(payload.get("metadata"), dict)
            else None
        )
        preset = metadata.get("preset") if isinstance(metadata, dict) else None
        preset_scope = preset.get("scope") if isinstance(preset, dict) else None
        preset_created_at = (
            preset.get("created_at") if isinstance(preset, dict) else None
        )
        canvas_scope = payload.get("canvas_scope") or preset_scope
        episode = payload.get("episode")
        if episode is None and isinstance(preset, dict):
            episode = preset.get("episode")
        beat = payload.get("beat")
        if beat is None and isinstance(preset, dict):
            beat = preset.get("beat")
        created_at = (
            payload.get("created_at")
            or preset_created_at
            or timestamp_utc_iso(path.stat().st_mtime)
        )
        items.append(
            {
                "id": path.stem,
                "created_at": created_at,
                "modified_at": timestamp_utc_iso(path.stat().st_mtime),
                "size": path.stat().st_size,
                "schema_version": payload.get("schema_version"),
                "canvas_scope": canvas_scope,
                "episode": episode,
                "beat": beat,
                "asset_target": payload.get("asset_target"),
                "revision": payload.get("revision"),
                "metadata": metadata,
            }
        )

    def scope_rank(item: dict) -> int:
        if item.get("id") == "default":
            return 0
        if item.get("canvas_scope") == "beat":
            return 1
        if item.get("canvas_scope") == "asset":
            return 2
        return 3

    def numeric_or_last(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 1_000_000_000

    items.sort(
        key=lambda item: (
            scope_rank(item),
            numeric_or_last(item.get("episode")),
            numeric_or_last(item.get("beat")),
            str(item.get("created_at") or ""),
            str(item.get("id") or ""),
        )
    )
    return items


def _check_revision(existing: dict | None, base_revision: int | None) -> None:
    current_revision = existing.get("revision") if isinstance(existing, dict) else None
    if not isinstance(current_revision, int):
        return
    if base_revision is None:
        raise CanvasBaseRevisionRequired()
    if base_revision != current_revision:
        raise CanvasRevisionConflict(
            current_revision=current_revision,
            base_revision=base_revision,
        )


def _node_count(payload: dict | None) -> int:
    nodes = payload.get("nodes") if isinstance(payload, dict) else None
    return len(nodes) if isinstance(nodes, list) else 0


def check_dangerous_empty_overwrite(
    *,
    existing: dict | None,
    payload: dict,
    save_source: str,
    allow_empty_overwrite: bool,
) -> None:
    old_nodes = _node_count(existing)
    new_nodes = _node_count(payload)
    if old_nodes > 0 and new_nodes == 0 and not (
        save_source in {"manual_clear", "projection_remove"}
        and allow_empty_overwrite
    ):
        raise DangerousEmptyCanvasOverwrite(
            old_nodes=old_nodes,
            new_nodes=new_nodes,
            save_source=save_source,
        )


def latest_preset_canvas(project_dir: Path, preset_key: str) -> str | None:
    candidates = [
        path
        for path in canvases_dir(project_dir).glob("*.json")
        if not path.name.endswith(".deleted.json")
    ]
    candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            payload = load_canvas_json(path) or {}
        except CanvasStoreError:
            continue
        key = (
            ((payload.get("metadata") or {}).get("preset") or {}).get(
                "preset_key"
            )
            if isinstance(payload, dict)
            else None
        )
        if key == preset_key:
            return path.stem
    return None


def save_canvas(
    project_dir: Path,
    canvas_id: str,
    *,
    base_revision: int | None,
    build_payload: Callable[[dict | None], dict],
    skip_if: Callable[[dict | None], dict | None] | None = None,
    enforce_revision: bool = True,
    client_save_id: str | None = None,
    request_hash: str | None = None,
    save_source: str = "autosave",
    allow_empty_overwrite: bool = False,
) -> CanvasSaveResult:
    with canvas_write_lock(project_dir, canvas_id):
        path = canvas_path(project_dir, canvas_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = load_canvas_json(path)
        normalized_client_save_id = str(client_save_id or "").strip()
        if normalized_client_save_id:
            entry = find_idempotency_entry(
                project_dir,
                canvas_id,
                normalized_client_save_id,
            )
            if entry is not None:
                stored_request_hash = entry.get("request_hash")
                if (
                    request_hash
                    and isinstance(stored_request_hash, str)
                    and stored_request_hash != request_hash
                ):
                    raise CanvasIdempotencyConflict(
                        client_save_id=normalized_client_save_id,
                    )
                response_cache = entry.get("response_cache")
                return CanvasSaveResult(
                    payload=(
                        response_cache if isinstance(response_cache, dict) else {}
                    ),
                    existing=existing,
                    backup_path=None,
                    idempotent=True,
                    response_cache=(
                        response_cache
                        if isinstance(response_cache, dict)
                        else None
                    ),
                )
        if skip_if is not None:
            response_cache = skip_if(existing)
            if response_cache is not None:
                return CanvasSaveResult(
                    payload=existing if isinstance(existing, dict) else {},
                    existing=existing,
                    backup_path=None,
                    response_cache=response_cache,
                )
        if enforce_revision:
            _check_revision(existing, base_revision)
        payload = build_payload(existing)
        metadata = payload.get("metadata") if isinstance(payload, dict) else None
        if isinstance(metadata, dict):
            payload["metadata"] = {
                key: value
                for key, value in metadata.items()
                if not (isinstance(key, str) and key.startswith("__"))
            }
        check_dangerous_empty_overwrite(
            existing=existing,
            payload=payload,
            save_source=save_source,
            allow_empty_overwrite=allow_empty_overwrite,
        )
        size_warning = canvas_payload_size_warning(payload)
        backup_path = backup_canvas_snapshot(path, existing)
        atomic_write_json(path, payload)
        prune_canvas_history(project_dir, canvas_id)
        response_cache = {
            "saved": True,
            "revision": payload.get("revision"),
            "updated_at": payload.get("updated_at"),
            "client_save_id": normalized_client_save_id or None,
        }
        if size_warning is not None:
            response_cache["warning"] = size_warning
        if normalized_client_save_id:
            append_idempotency_entry(
                project_dir,
                canvas_id,
                client_save_id=normalized_client_save_id,
                revision=(
                    payload.get("revision")
                    if isinstance(payload.get("revision"), int)
                    else None
                ),
                request_hash=request_hash,
                response_cache=response_cache,
            )
        return CanvasSaveResult(
            payload=payload,
            existing=existing,
            backup_path=backup_path,
            response_cache=response_cache,
        )


def restore_canvas_version(
    project_dir: Path,
    canvas_id: str,
    *,
    history_id: str,
    base_revision: int | None,
    build_payload: Callable[[dict | None, dict], dict],
) -> CanvasRestoreResult:
    with canvas_write_lock(project_dir, canvas_id):
        path = canvas_path(project_dir, canvas_id)
        existing = load_canvas_json(path)
        _check_revision(existing, base_revision)
        history_file = resolve_canvas_history_file(
            project_dir,
            canvas_id,
            history_id,
        )
        history_payload = load_canvas_json(history_file) or {
            "nodes": [],
            "edges": [],
        }
        payload = build_payload(existing, history_payload)
        backup_path = backup_canvas_snapshot(path, existing)
        atomic_write_json(path, payload)
        prune_canvas_history(project_dir, canvas_id)
        return CanvasRestoreResult(
            payload=payload,
            existing=existing,
            history_payload=history_payload,
            backup_path=backup_path,
        )


def soft_delete_canvas(
    project_dir: Path,
    canvas_id: str,
    *,
    deleted_by: str,
) -> CanvasDeleteResult:
    with canvas_write_lock(project_dir, canvas_id):
        path = canvas_path(project_dir, canvas_id)
        existing = load_canvas_json(path)
        if not path.exists():
            return CanvasDeleteResult(existing=existing, deleted_path=None)
        deleted_dir = canvas_deleted_dir_for_path(path)
        deleted_dir.mkdir(parents=True, exist_ok=True)
        target = deleted_dir / canvas_deleted_filename(existing)
        path.replace(target)
        tombstone = path.with_name(f"{path.stem}.deleted.json")
        revision = existing.get("revision") if isinstance(existing, dict) else None
        atomic_write_json(
            tombstone,
            {
                "schema_version": "canvas_tombstone.v1",
                "canvas_id": canvas_id,
                "deleted": True,
                "deleted_at": utc_now_iso(),
                "deleted_by": deleted_by,
                "revision": revision if isinstance(revision, int) else None,
                "deleted_snapshot": relative_project_path(project_dir, target),
            },
        )
        idempotency_path = canvas_idempotency_path(project_dir, canvas_id)
        if idempotency_path.exists():
            try:
                idempotency_path.unlink()
            except FileNotFoundError:
                pass
        return CanvasDeleteResult(existing=existing, deleted_path=target)


def prune_orphan_locks(project_dir: Path) -> list[Path]:
    """Remove lock files whose canvas no longer exists."""
    from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import (
        canvas_locks_dir,
    )

    locks_dir = canvas_locks_dir(project_dir)
    if not locks_dir.exists():
        return []
    canvas_dir = canvases_dir(project_dir)
    removed: list[Path] = []
    for lock_path in sorted(locks_dir.glob("*.lock")):
        canvas_id = lock_path.stem
        live_canvas = canvas_dir / f"{canvas_id}.json"
        if live_canvas.exists():
            continue
        try:
            lock_path.unlink()
        except FileNotFoundError:
            continue
        removed.append(lock_path)
    return removed

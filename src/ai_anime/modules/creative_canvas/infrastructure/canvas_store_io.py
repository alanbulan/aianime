"""Atomic JSON I/O and payload diagnostics for Creative Canvas storage."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasCorruptError,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import canvas_path

CANVAS_PAYLOAD_SIZE_LIMIT_BYTES = int(
    os.environ.get("FREEZONE_CANVAS_PAYLOAD_LIMIT_BYTES") or 5 * 1024 * 1024
)
CANVAS_PAYLOAD_DIAGNOSTIC_LIMIT = 8

logger = logging.getLogger(__name__)


def utc_iso(dt: datetime) -> str:
    """Return an absolute ISO timestamp for API and persisted metadata."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def utc_now_iso() -> str:
    return utc_iso(datetime.now(timezone.utc))


def timestamp_utc_iso(timestamp: float) -> str:
    return utc_iso(datetime.fromtimestamp(timestamp, tz=timezone.utc))


def parse_canvas_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def load_canvas_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CanvasCorruptError(f"corrupt canvas json: {exc}") from exc
    return payload if isinstance(payload, dict) else None


def read_canvas(project_dir: Path, canvas_id: str) -> dict | None:
    return load_canvas_json(canvas_path(project_dir, canvas_id))


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(
        f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    )
    data = json.dumps(payload, ensure_ascii=False, indent=2)
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
        try:
            directory_fd = os.open(str(path.parent), os.O_RDONLY)
        except OSError:
            directory_fd = None
        if directory_fd is not None:
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        if temporary.exists():
            temporary.unlink(missing_ok=True)


def serialized_canvas_size_bytes(payload: dict) -> int:
    data = json.dumps(payload, ensure_ascii=False, indent=2)
    return len(data.encode("utf-8"))


def canvas_request_hash(payload: dict) -> str:
    data = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _json_size_bytes(value: object) -> int:
    return len(json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8"))


def oversized_canvas_diagnostics(payload: dict, *, limit: int) -> list[dict]:
    """Return the largest canvas fields without including their values."""
    rows: list[dict] = []
    nodes = payload.get("nodes")
    if isinstance(nodes, list):
        for index, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            node_id = str(node.get("id") or "")
            node_type = str(node.get("type") or "")
            rows.append(
                {
                    "path": f"nodes[{index}]",
                    "node_id": node_id,
                    "node_type": node_type,
                    "bytes": _json_size_bytes(node),
                }
            )
            data = node.get("data")
            if isinstance(data, dict):
                for key, value in data.items():
                    rows.append(
                        {
                            "path": f"nodes[{index}].data.{key}",
                            "node_id": node_id,
                            "node_type": node_type,
                            "bytes": _json_size_bytes(value),
                        }
                    )
    rows.sort(key=lambda row: int(row.get("bytes") or 0), reverse=True)
    result = []
    for row in rows[:limit]:
        size = int(row["bytes"])
        result.append({**row, "kb": round(size / 1024, 1)})
    return result


def canvas_payload_size_warning(payload: dict) -> dict | None:
    limit = CANVAS_PAYLOAD_SIZE_LIMIT_BYTES
    if limit <= 0:
        return None
    actual = serialized_canvas_size_bytes(payload)
    if actual <= limit:
        return None
    top_fields = oversized_canvas_diagnostics(
        payload,
        limit=CANVAS_PAYLOAD_DIAGNOSTIC_LIMIT,
    )
    logger.warning(
        "freezone_canvas_payload_too_large actual_bytes=%s limit_bytes=%s "
        "top_fields=%s",
        actual,
        limit,
        top_fields,
    )
    return {
        "code": "canvas_payload_large",
        "actual_kb": (actual + 1023) // 1024,
        "limit_kb": (limit + 1023) // 1024,
        "top_fields": top_fields,
    }


def relative_project_path(project_dir: Path, path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return path.relative_to(project_dir).as_posix()
    except ValueError:
        return path.as_posix()

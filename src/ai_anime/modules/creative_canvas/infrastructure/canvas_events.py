"""Local JSONL Creative Canvas event writer."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from pathlib import Path

from ai_anime.freezone import canvas_store
from ai_anime.freezone.paths import CANVAS_ID_RE, freezone_root
from ai_anime.modules.creative_canvas.application.canvas_events import (
    RecordCreativeCanvasEventCommand,
)


CANVAS_EVENT_SCHEMA_VERSION = "canvas_event.v1"

EventIdFactory = Callable[[], str]
UtcNow = Callable[[], str]


class LocalCreativeCanvasEventWriter:
    def __init__(
        self,
        *,
        event_id_factory: EventIdFactory = lambda: uuid.uuid4().hex,
        utc_now: UtcNow = canvas_store.utc_now_iso,
    ) -> None:
        self._event_id_factory = event_id_factory
        self._utc_now = utc_now

    def append(self, command: RecordCreativeCanvasEventCommand) -> None:
        path = self._event_log_path(command.project_dir, command.canvas_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "schema_version": CANVAS_EVENT_SCHEMA_VERSION,
            "event_id": self._event_id_factory(),
            "project_id": command.project_id,
            "canvas_id": (command.canvas_id or "").strip() or "_project",
            "event_type": command.event_type,
            "actor": {
                "kind": command.actor.kind,
                "id": command.actor.id,
                "username": command.actor.username,
            },
            "created_at": self._utc_now(),
            "payload": dict(command.payload),
        }
        with path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    @staticmethod
    def _event_log_path(project_dir: Path, canvas_id: str | None) -> Path:
        event_canvas_id = (canvas_id or "").strip() or "_project"
        if not CANVAS_ID_RE.match(event_canvas_id):
            digest = hashlib.sha256(event_canvas_id.encode("utf-8")).hexdigest()[:16]
            event_canvas_id = f"canvas_{digest}"
        return freezone_root(project_dir) / "_canvas_events" / f"{event_canvas_id}.jsonl"


__all__ = ["LocalCreativeCanvasEventWriter"]

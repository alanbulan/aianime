from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.domain.canvas_events import (
    CreativeCanvasEventActor,
    canvas_event_actor,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_events import (
    LocalCreativeCanvasEventWriter,
)


def test_canvas_event_actor_preserves_user_identity_priority() -> None:
    assert canvas_event_actor(
        {"id": "user-1", "user_id": "ignored", "username": "alice"}
    ) == CreativeCanvasEventActor(
        kind="user",
        id="user-1",
        username="alice",
    )
    assert canvas_event_actor(
        {"user_id": "not-used", "username": "alice"}
    ) == CreativeCanvasEventActor(
        kind="user",
        id="alice",
        username="alice",
    )
    assert canvas_event_actor({}) == CreativeCanvasEventActor(
        kind="user",
        id="unknown",
        username="",
    )


def test_canvas_event_recorder_delegates_to_writer(tmp_path: Path) -> None:
    commands: list[RecordCreativeCanvasEventCommand] = []

    class Writer:
        def append(self, command):
            commands.append(command)

    command = RecordCreativeCanvasEventCommand(
        project_dir=tmp_path,
        project_id="project-1",
        canvas_id="default",
        event_type="canvas.saved",
        actor=CreativeCanvasEventActor("user", "user-1", "alice"),
        payload={"revision": 2},
    )

    CreativeCanvasEventRecorder(Writer()).record(command)

    assert commands == [command]


def test_local_canvas_event_writer_appends_stable_jsonl_record(tmp_path: Path) -> None:
    writer = LocalCreativeCanvasEventWriter(
        event_id_factory=lambda: "event-1",
        utc_now=lambda: "2026-07-27T12:00:00Z",
    )
    command = RecordCreativeCanvasEventCommand(
        project_dir=tmp_path,
        project_id="project-1",
        canvas_id="default",
        event_type="canvas.saved",
        actor=CreativeCanvasEventActor("user", "user-1", "alice"),
        payload={"revision": 2, "label": "画布"},
    )

    writer.append(command)
    writer.append(command)

    path = tmp_path / "freezone" / "_canvas_events" / "default.jsonl"
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert records == [
        {
            "schema_version": "canvas_event.v1",
            "event_id": "event-1",
            "project_id": "project-1",
            "canvas_id": "default",
            "event_type": "canvas.saved",
            "actor": {"kind": "user", "id": "user-1", "username": "alice"},
            "created_at": "2026-07-27T12:00:00Z",
            "payload": {"revision": 2, "label": "画布"},
        },
        {
            "schema_version": "canvas_event.v1",
            "event_id": "event-1",
            "project_id": "project-1",
            "canvas_id": "default",
            "event_type": "canvas.saved",
            "actor": {"kind": "user", "id": "user-1", "username": "alice"},
            "created_at": "2026-07-27T12:00:00Z",
            "payload": {"revision": 2, "label": "画布"},
        },
    ]


def test_local_canvas_event_writer_hashes_unsafe_log_filename(tmp_path: Path) -> None:
    writer = LocalCreativeCanvasEventWriter(
        event_id_factory=lambda: "event-2",
        utc_now=lambda: "2026-07-27T12:00:00Z",
    )
    unsafe_canvas_id = "../outside"
    writer.append(
        RecordCreativeCanvasEventCommand(
            project_dir=tmp_path,
            project_id="project-1",
            canvas_id=unsafe_canvas_id,
            event_type="skill.run_requested",
            actor=CreativeCanvasEventActor("user", "user-1", "alice"),
            payload={},
        )
    )

    digest = hashlib.sha256(unsafe_canvas_id.encode("utf-8")).hexdigest()[:16]
    path = tmp_path / "freezone" / "_canvas_events" / f"canvas_{digest}.jsonl"
    record = json.loads(path.read_text(encoding="utf-8"))
    assert record["canvas_id"] == unsafe_canvas_id
    assert not (tmp_path / "outside.jsonl").exists()

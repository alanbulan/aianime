from __future__ import annotations

from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasRevisionConflict,
    DangerousEmptyCanvasOverwrite,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import CanvasLockBusy
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
)
from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
)
from ai_anime.modules.creative_canvas.application.canvas_writes import (
    CreativeCanvasDocumentCommands,
    CreativeCanvasDocumentMutationResult,
    CreativeCanvasDocumentRevisionConflict,
    DangerousCreativeCanvasDocumentOverwrite,
    SaveCreativeCanvasDocumentCommand,
)
from ai_anime.modules.creative_canvas.domain import (
    CreativeCanvasEventActor,
    prepare_creative_canvas_payload_for_write,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_writes import (
    translate_canvas_store_error,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="editor",
        home_node_id="node-1",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_prepare_creative_canvas_payload_for_write_preserves_document_contract() -> None:
    payload = prepare_creative_canvas_payload_for_write(
        project_id="project-1",
        canvas_id="default",
        incoming={
            "base_revision": 2,
            "nodes": [
                {
                    "id": "context",
                    "data": {"mainline_context": [{"kind": "beat"}]},
                }
            ],
            "edges": [],
            "metadata": {"shotMetadata": {}},
        },
        existing={
            "revision": 2,
            "metadata": {"preset": {"scope": "beat"}},
            "owner_principal_id": "owner-1",
            "created_by": "creator-1",
            "created_at": "2026-07-26T12:00:00Z",
        },
        actor_id="user-1",
        updated_at="2026-07-27T12:00:00Z",
    )

    assert payload["schema_version"] == 2
    assert payload["canvas_id"] == "default"
    assert payload["project_id"] == "project-1"
    assert payload["canvas_scope"] == "beat"
    assert payload["revision"] == 3
    assert payload["owner_principal_id"] == "owner-1"
    assert payload["created_by"] == "creator-1"
    assert payload["created_at"] == "2026-07-26T12:00:00Z"
    assert payload["updated_by"] == "user-1"
    assert payload["updated_at"] == "2026-07-27T12:00:00Z"
    assert payload["metadata"] == {
        "preset": {"scope": "beat"},
        "shotMetadata": {},
    }
    assert payload["nodes"][0]["data"]["mainline_context"] == [
        {"kind": "beat", "projectId": "project-1"}
    ]
    assert "base_revision" not in payload


def test_creative_canvas_document_commands_record_gateway_event(tmp_path: Path) -> None:
    gateway_commands: list[SaveCreativeCanvasDocumentCommand] = []
    event_commands = []

    class Gateway:
        def save_document(self, command):
            gateway_commands.append(command)
            return CreativeCanvasDocumentMutationResult(
                response={"saved": True, "revision": 3},
                event_type="canvas.saved",
                event_payload={"revision": 3},
            )

    class EventWriter:
        def append(self, command):
            event_commands.append(command)

    command = SaveCreativeCanvasDocumentCommand(
        context=_context(tmp_path),
        project_id="project-1",
        canvas_id="default",
        payload={"nodes": [], "edges": []},
        request_hash_payload={"nodes": [], "edges": []},
        base_revision=2,
        client_save_id=None,
        save_source="autosave",
        allow_empty_overwrite=False,
        actor_id="user-1",
        event_actor=CreativeCanvasEventActor("user", "user-1", "alice"),
    )

    response = CreativeCanvasDocumentCommands(
        Gateway(),
        CreativeCanvasEventRecorder(EventWriter()),
    ).save(command)

    assert response == {"saved": True, "revision": 3}
    assert gateway_commands == [command]
    assert len(event_commands) == 1
    assert event_commands[0].project_dir == tmp_path / "state"
    assert event_commands[0].project_id == "project-1"
    assert event_commands[0].event_type == "canvas.saved"
    assert event_commands[0].payload == {"revision": 3}


def test_translate_canvas_store_error_preserves_conflict_details() -> None:
    revision = translate_canvas_store_error(
        CanvasRevisionConflict(
            current_revision=4,
            base_revision=2,
        )
    )
    assert isinstance(revision, CreativeCanvasDocumentRevisionConflict)
    assert revision.current_revision == 4
    assert revision.base_revision == 2

    dangerous = translate_canvas_store_error(
        DangerousEmptyCanvasOverwrite(
            old_nodes=2,
            new_nodes=0,
            save_source="autosave",
        )
    )
    assert isinstance(dangerous, DangerousCreativeCanvasDocumentOverwrite)
    assert dangerous.old_nodes == 2
    assert dangerous.new_nodes == 0
    assert dangerous.save_source == "autosave"

    busy = translate_canvas_store_error(CanvasLockBusy("default"))
    assert isinstance(busy, CreativeCanvasDocumentBusy)
    assert busy.canvas_id == "default"

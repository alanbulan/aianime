"""Creative Canvas document-write application services."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.creative_canvas.application.canvas_events import (
    CreativeCanvasEventRecorder,
    RecordCreativeCanvasEventCommand,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasEventActor
from ai_anime.modules.project_workspace.public import ProjectContext


class CreativeCanvasDocumentWriteError(RuntimeError):
    pass


class CreativeCanvasDocumentBaseRevisionRequired(CreativeCanvasDocumentWriteError):
    def __init__(self) -> None:
        super().__init__("canvas base_revision is required")


class CreativeCanvasDocumentRevisionConflict(CreativeCanvasDocumentWriteError):
    def __init__(self, *, current_revision: int, base_revision: int | None) -> None:
        self.current_revision = current_revision
        self.base_revision = base_revision
        super().__init__("canvas revision conflict")


class CreativeCanvasDocumentIdempotencyConflict(CreativeCanvasDocumentWriteError):
    def __init__(self, *, client_save_id: str) -> None:
        self.client_save_id = client_save_id
        super().__init__("canvas idempotency key reused for a different payload")


class InvalidCreativeCanvasDocumentHistoryId(CreativeCanvasDocumentWriteError):
    def __init__(self) -> None:
        super().__init__("invalid history_id")


class CreativeCanvasDocumentHistoryNotFound(CreativeCanvasDocumentWriteError):
    def __init__(self) -> None:
        super().__init__("canvas history not found")


class DangerousCreativeCanvasDocumentOverwrite(CreativeCanvasDocumentWriteError):
    def __init__(self, *, old_nodes: int, new_nodes: int, save_source: str) -> None:
        self.old_nodes = old_nodes
        self.new_nodes = new_nodes
        self.save_source = save_source
        super().__init__("dangerous empty canvas overwrite")


class CreativeCanvasDocumentStorageFailed(CreativeCanvasDocumentWriteError):
    pass


@dataclass(frozen=True)
class SaveCreativeCanvasDocumentCommand:
    context: ProjectContext
    project_id: str
    canvas_id: str
    payload: Mapping[str, Any]
    request_hash_payload: Mapping[str, Any]
    base_revision: int | None
    client_save_id: str | None
    save_source: str
    allow_empty_overwrite: bool
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class RestoreCreativeCanvasDocumentCommand:
    context: ProjectContext
    project_id: str
    canvas_id: str
    history_id: str
    base_revision: int | None
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class DeleteCreativeCanvasDocumentCommand:
    context: ProjectContext
    project_id: str
    canvas_id: str
    actor_id: str
    event_actor: CreativeCanvasEventActor


@dataclass(frozen=True)
class CreativeCanvasDocumentMutationResult:
    response: Mapping[str, Any]
    event_type: str | None
    event_payload: Mapping[str, Any] | None


class CreativeCanvasDocumentCommandGateway(Protocol):
    def save_document(
        self,
        command: SaveCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult: ...

    def restore_document(
        self,
        command: RestoreCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult: ...

    def delete_document(
        self,
        command: DeleteCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult: ...


class CreativeCanvasDocumentCommands:
    def __init__(
        self,
        gateway: CreativeCanvasDocumentCommandGateway,
        event_recorder: CreativeCanvasEventRecorder,
    ) -> None:
        self._gateway = gateway
        self._event_recorder = event_recorder

    def save(self, command: SaveCreativeCanvasDocumentCommand) -> Mapping[str, Any]:
        return self._finish(command, self._gateway.save_document(command))

    def restore(
        self,
        command: RestoreCreativeCanvasDocumentCommand,
    ) -> Mapping[str, Any]:
        return self._finish(command, self._gateway.restore_document(command))

    def delete(
        self,
        command: DeleteCreativeCanvasDocumentCommand,
    ) -> Mapping[str, Any]:
        return self._finish(command, self._gateway.delete_document(command))

    def _finish(
        self,
        command: (
            SaveCreativeCanvasDocumentCommand
            | RestoreCreativeCanvasDocumentCommand
            | DeleteCreativeCanvasDocumentCommand
        ),
        result: CreativeCanvasDocumentMutationResult,
    ) -> Mapping[str, Any]:
        if result.event_type is not None and result.event_payload is not None:
            self._event_recorder.record(
                RecordCreativeCanvasEventCommand(
                    project_dir=Path(command.context.state_dir),
                    project_id=command.project_id,
                    canvas_id=command.canvas_id,
                    event_type=result.event_type,
                    actor=command.event_actor,
                    payload=result.event_payload,
                )
            )
        return result.response


__all__ = [
    "CreativeCanvasDocumentBaseRevisionRequired",
    "CreativeCanvasDocumentCommandGateway",
    "CreativeCanvasDocumentCommands",
    "CreativeCanvasDocumentHistoryNotFound",
    "CreativeCanvasDocumentIdempotencyConflict",
    "CreativeCanvasDocumentMutationResult",
    "CreativeCanvasDocumentRevisionConflict",
    "CreativeCanvasDocumentStorageFailed",
    "CreativeCanvasDocumentWriteError",
    "DangerousCreativeCanvasDocumentOverwrite",
    "DeleteCreativeCanvasDocumentCommand",
    "InvalidCreativeCanvasDocumentHistoryId",
    "RestoreCreativeCanvasDocumentCommand",
    "SaveCreativeCanvasDocumentCommand",
]

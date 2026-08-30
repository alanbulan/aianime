"""Local persistence adapter for Creative Canvas document writes."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ai_anime.modules.creative_canvas.infrastructure import canvas_store
from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import CanvasLockBusy
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_contracts import (
    CanvasBaseRevisionRequired,
    CanvasCorruptError,
    CanvasDeleteResult,
    CanvasHistoryNotFound,
    CanvasIdempotencyConflict,
    CanvasInvalidHistoryId,
    CanvasRestoreResult,
    CanvasRevisionConflict,
    CanvasSaveResult,
    CanvasStoreError,
    DangerousEmptyCanvasOverwrite,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_store_io import (
    canvas_request_hash,
    relative_project_path,
)
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
)
from ai_anime.modules.creative_canvas.application.canvas_writes import (
    CreativeCanvasDocumentBaseRevisionRequired,
    CreativeCanvasDocumentHistoryNotFound,
    CreativeCanvasDocumentIdempotencyConflict,
    CreativeCanvasDocumentMutationResult,
    CreativeCanvasDocumentRevisionConflict,
    CreativeCanvasDocumentStorageFailed,
    DangerousCreativeCanvasDocumentOverwrite,
    DeleteCreativeCanvasDocumentCommand,
    InvalidCreativeCanvasDocumentHistoryId,
    RestoreCreativeCanvasDocumentCommand,
    SaveCreativeCanvasDocumentCommand,
)
from ai_anime.modules.creative_canvas.domain import (
    prepare_creative_canvas_payload_for_write,
)
from ai_anime.shared.utils.time_format import utc_now_iso


SaveCanvas = Callable[..., CanvasSaveResult]
RestoreCanvas = Callable[..., CanvasRestoreResult]
DeleteCanvas = Callable[..., CanvasDeleteResult]
RequestHash = Callable[[dict], str]
UtcNow = Callable[[], str]


def translate_canvas_store_error(exc: Exception) -> Exception:
    if isinstance(exc, CanvasCorruptError):
        return CreativeCanvasDocumentCorrupt(str(exc))
    if isinstance(exc, CanvasBaseRevisionRequired):
        return CreativeCanvasDocumentBaseRevisionRequired()
    if isinstance(exc, CanvasRevisionConflict):
        return CreativeCanvasDocumentRevisionConflict(
            current_revision=exc.current_revision,
            base_revision=exc.base_revision,
        )
    if isinstance(exc, CanvasIdempotencyConflict):
        return CreativeCanvasDocumentIdempotencyConflict(
            client_save_id=exc.client_save_id,
        )
    if isinstance(exc, CanvasInvalidHistoryId):
        return InvalidCreativeCanvasDocumentHistoryId()
    if isinstance(exc, CanvasHistoryNotFound):
        return CreativeCanvasDocumentHistoryNotFound()
    if isinstance(exc, DangerousEmptyCanvasOverwrite):
        return DangerousCreativeCanvasDocumentOverwrite(
            old_nodes=exc.old_nodes,
            new_nodes=exc.new_nodes,
            save_source=exc.save_source,
        )
    if isinstance(exc, CanvasLockBusy):
        return CreativeCanvasDocumentBusy(exc.canvas_id)
    return CreativeCanvasDocumentStorageFailed(str(exc))


class LocalCreativeCanvasDocumentCommandGateway:
    def __init__(
        self,
        *,
        save_canvas: SaveCanvas | None = None,
        restore_canvas: RestoreCanvas | None = None,
        delete_canvas: DeleteCanvas | None = None,
        request_hash: RequestHash | None = None,
        utc_now: UtcNow | None = None,
    ) -> None:
        self._save_canvas = save_canvas
        self._restore_canvas = restore_canvas
        self._delete_canvas = delete_canvas
        self._request_hash = request_hash
        self._utc_now = utc_now

    def save_document(
        self,
        command: SaveCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult:
        project_dir = Path(command.context.state_dir)

        def build_payload(existing: dict | None) -> dict:
            return prepare_creative_canvas_payload_for_write(
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                incoming=command.payload,
                existing=existing,
                actor_id=command.actor_id,
                updated_at=self._now(),
            )

        try:
            saved_canvas = (self._save_canvas or canvas_store.save_canvas)(
                project_dir,
                command.canvas_id,
                base_revision=command.base_revision,
                build_payload=build_payload,
                client_save_id=command.client_save_id,
                request_hash=(self._request_hash or canvas_request_hash)(
                    dict(command.request_hash_payload)
                ),
                save_source=command.save_source,
                allow_empty_overwrite=command.allow_empty_overwrite,
            )
        except (CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        payload = saved_canvas.payload
        event_payload = None
        if not saved_canvas.idempotent:
            event_payload = {
                "revision": payload.get("revision"),
                "base_revision": command.base_revision,
                "node_count": len(payload.get("nodes") or []),
                "edge_count": len(payload.get("edges") or []),
                "client_save_id": command.client_save_id,
                "save_source": command.save_source,
                "backup_path": relative_project_path(
                    project_dir,
                    saved_canvas.backup_path,
                ),
            }
        response = saved_canvas.response_cache or {
            "saved": True,
            "revision": payload.get("revision"),
            "updated_at": payload.get("updated_at"),
            "client_save_id": command.client_save_id,
        }
        return CreativeCanvasDocumentMutationResult(
            response=response,
            event_type="canvas.saved" if event_payload is not None else None,
            event_payload=event_payload,
        )

    def restore_document(
        self,
        command: RestoreCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult:
        project_dir = Path(command.context.state_dir)

        def build_payload(existing: dict | None, history_payload: dict) -> dict:
            return prepare_creative_canvas_payload_for_write(
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                incoming=history_payload,
                existing=existing,
                actor_id=command.actor_id,
                updated_at=self._now(),
            )

        try:
            restored_canvas = (
                self._restore_canvas or canvas_store.restore_canvas_version
            )(
                project_dir,
                command.canvas_id,
                history_id=command.history_id,
                base_revision=command.base_revision,
                build_payload=build_payload,
            )
        except (CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        payload = restored_canvas.payload
        restored_from_revision = restored_canvas.history_payload.get("revision")
        return CreativeCanvasDocumentMutationResult(
            response={
                "restored": True,
                "revision": payload["revision"],
                "restored_from_revision": restored_from_revision,
            },
            event_type="canvas.restored",
            event_payload={
                "revision": payload.get("revision"),
                "base_revision": command.base_revision,
                "restored_from_revision": restored_from_revision,
                "history_id": command.history_id,
                "node_count": len(payload.get("nodes") or []),
                "edge_count": len(payload.get("edges") or []),
                "backup_path": relative_project_path(
                    project_dir,
                    restored_canvas.backup_path,
                ),
            },
        )

    def delete_document(
        self,
        command: DeleteCreativeCanvasDocumentCommand,
    ) -> CreativeCanvasDocumentMutationResult:
        project_dir = Path(command.context.state_dir)
        try:
            deleted_canvas = (self._delete_canvas or canvas_store.soft_delete_canvas)(
                project_dir,
                command.canvas_id,
                deleted_by=command.actor_id,
            )
        except (CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        existing = deleted_canvas.existing
        return CreativeCanvasDocumentMutationResult(
            response={"deleted": True},
            event_type="canvas.deleted",
            event_payload={
                "revision": (
                    existing.get("revision") if isinstance(existing, dict) else None
                ),
                "deleted_path": relative_project_path(
                    project_dir,
                    deleted_canvas.deleted_path,
                ),
            },
        )

    def _now(self) -> str:
        return (self._utc_now or utc_now_iso)()


__all__ = [
    "LocalCreativeCanvasDocumentCommandGateway",
    "translate_canvas_store_error",
]

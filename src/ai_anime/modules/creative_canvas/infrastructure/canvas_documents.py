"""Local Creative Canvas document-query adapter."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from ai_anime.freezone import canvas_store
from ai_anime.freezone.canvas_lock import CanvasLockBusy
from ai_anime.freezone.canvas_static_urls import (
    migrate_canvas_static_urls_in_memory,
    sanitize_project_local_paths_in_memory,
)
from ai_anime.freezone.history import (
    read_canvas_generation_history,
    read_generation_history,
)
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
)
from ai_anime.modules.project_workspace.public import ProjectContext


EnsureDefaultCanvas = Callable[..., Any]
ListCanvasDocuments = Callable[[Path], list[dict]]
ListCanvasDocumentHistory = Callable[[Path, str], list[dict]]
ReadGenerationHistory = Callable[..., list[dict[str, Any]]]
ProjectPayloadTransform = Callable[..., dict[str, Any] | None]


class LocalCreativeCanvasDocumentQueryGateway:
    def __init__(
        self,
        *,
        ensure_default_canvas: EnsureDefaultCanvas = canvas_store.ensure_default_canvas,
        list_canvas_documents: ListCanvasDocuments = canvas_store.list_canvases,
        list_canvas_document_history: ListCanvasDocumentHistory = (
            canvas_store.list_canvas_history
        ),
        node_generation_history_reader: ReadGenerationHistory = (
            read_generation_history
        ),
        generation_history_reader: ReadGenerationHistory = (
            read_canvas_generation_history
        ),
        static_url_migrator: ProjectPayloadTransform = (
            migrate_canvas_static_urls_in_memory
        ),
        local_path_sanitizer: ProjectPayloadTransform = (
            sanitize_project_local_paths_in_memory
        ),
    ) -> None:
        self._ensure_default_canvas = ensure_default_canvas
        self._list_canvas_documents = list_canvas_documents
        self._list_canvas_document_history = list_canvas_document_history
        self._node_generation_history_reader = node_generation_history_reader
        self._generation_history_reader = generation_history_reader
        self._static_url_migrator = static_url_migrator
        self._local_path_sanitizer = local_path_sanitizer

    def list_documents(
        self,
        *,
        context: ProjectContext,
        actor_id: str,
    ) -> Sequence[Mapping[str, Any]]:
        state_dir = Path(context.state_dir)
        try:
            self._ensure_default_canvas(
                state_dir,
                project_id=context.project_id,
                actor_id=actor_id,
            )
            return self._list_canvas_documents(state_dir)
        except canvas_store.CanvasCorruptError as exc:
            raise CreativeCanvasDocumentCorrupt(str(exc)) from exc
        except CanvasLockBusy as exc:
            raise CreativeCanvasDocumentBusy(exc.canvas_id) from exc

    def list_document_history(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
    ) -> Sequence[Mapping[str, Any]]:
        try:
            return self._list_canvas_document_history(
                Path(context.state_dir),
                canvas_id,
            )
        except canvas_store.CanvasCorruptError as exc:
            raise CreativeCanvasDocumentCorrupt(str(exc)) from exc

    def list_node_generation_history(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        node_id: str,
        limit: int,
    ) -> Sequence[Mapping[str, Any]]:
        records = self._node_generation_history_reader(
            project_dir=project_dir,
            canvas_id=canvas_id,
            node_id=node_id,
            limit=limit,
        )
        return self._project_records(context, project_dir, records)

    def list_generation_history(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        limit: int,
    ) -> Sequence[Mapping[str, Any]]:
        records = self._generation_history_reader(
            project_dir=project_dir,
            canvas_id=canvas_id,
            limit=limit,
        )
        return self._project_records(context, project_dir, records)

    def _project_records(
        self,
        context: ProjectContext,
        project_dir: Path,
        records: Sequence[Mapping[str, Any]],
    ) -> list[Mapping[str, Any]]:
        projected: list[Mapping[str, Any]] = []
        for source_record in records:
            record = dict(source_record)
            migrated = (
                self._static_url_migrator(
                    record,
                    project_id=context.project_id,
                    owner_username=context.owner_username,
                    project_name=context.project_name,
                    project_dir=project_dir,
                )
                or record
            )
            sanitized = (
                self._local_path_sanitizer(
                    migrated,
                    project_id=context.project_id,
                    project_dir=project_dir,
                )
                or migrated
            )
            projected.append(sanitized)
        return projected


__all__ = ["LocalCreativeCanvasDocumentQueryGateway"]

"""Local Creative Canvas document-query adapter."""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
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
from ai_anime.freezone.presets import (
    build_beat_preset_context,
    build_canvas_payload_from_context,
)
from ai_anime.modules.creative_canvas.application.canvas_documents import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
)
from ai_anime.modules.creative_canvas.domain import (
    merge_restored_preset_canvas,
    stamp_canvas_mainline_context_project_id,
    sync_frame_context_reference_edges,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)


logger = logging.getLogger(__name__)


EnsureDefaultCanvas = Callable[..., Any]
ReadCanvas = Callable[[Path, str], dict | None]
ListCanvasDocuments = Callable[[Path], list[dict]]
ListCanvasDocumentHistory = Callable[[Path, str], list[dict]]
ReadGenerationHistory = Callable[..., list[dict[str, Any]]]
ProjectPayloadTransform = Callable[..., dict[str, Any] | None]
StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
BeatPresetContextBuilder = Callable[..., Awaitable[dict[str, Any]]]
CanvasPayloadBuilder = Callable[..., dict[str, Any]]
UtcNow = Callable[[], str]


_PRESERVED_REFRESH_FIELDS = (
    "schema_version",
    "canvas_id",
    "project_id",
    "canvas_scope",
    "owner_principal_type",
    "owner_principal_id",
    "access_model",
    "min_project_role",
    "created_by",
    "created_at",
    "updated_by",
    "updated_at",
    "revision",
)


class LocalCreativeCanvasDocumentQueryGateway:
    def __init__(
        self,
        *,
        ensure_default_canvas: EnsureDefaultCanvas = canvas_store.ensure_default_canvas,
        read_canvas: ReadCanvas = canvas_store.read_canvas,
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
        store_factory: StoreFactory = make_sqlite_store_for_context,
        beat_preset_context_builder: BeatPresetContextBuilder = (
            build_beat_preset_context
        ),
        canvas_payload_builder: CanvasPayloadBuilder = (
            build_canvas_payload_from_context
        ),
        utc_now: UtcNow = canvas_store.utc_now_iso,
    ) -> None:
        self._ensure_default_canvas = ensure_default_canvas
        self._read_canvas = read_canvas
        self._list_canvas_documents = list_canvas_documents
        self._list_canvas_document_history = list_canvas_document_history
        self._node_generation_history_reader = node_generation_history_reader
        self._generation_history_reader = generation_history_reader
        self._static_url_migrator = static_url_migrator
        self._local_path_sanitizer = local_path_sanitizer
        self._store_factory = store_factory
        self._beat_preset_context_builder = beat_preset_context_builder
        self._canvas_payload_builder = canvas_payload_builder
        self._utc_now = utc_now

    async def get_document(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        canvas_id: str,
        actor_id: str,
    ) -> Mapping[str, Any]:
        state_dir = Path(context.state_dir)
        try:
            if canvas_id == "default":
                self._ensure_default_canvas(
                    state_dir,
                    project_id=context.project_id,
                    actor_id=actor_id,
                )
            payload = self._read_canvas(state_dir, canvas_id)
        except canvas_store.CanvasCorruptError as exc:
            raise CreativeCanvasDocumentCorrupt(str(exc)) from exc
        except CanvasLockBusy as exc:
            raise CreativeCanvasDocumentBusy(exc.canvas_id) from exc

        if payload is None:
            return {"nodes": [], "edges": [], "viewport": None}

        refreshed = await self._refresh_beat_preset(
            context=context,
            project_dir=project_dir,
            payload=payload,
        )
        migrated = self._static_url_migrator(
            refreshed or {"nodes": [], "edges": []},
            project_id=context.project_id,
            owner_username=context.owner_username,
            project_name=context.project_name,
            project_dir=project_dir,
        )
        return migrated or {"nodes": [], "edges": []}

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

    async def _refresh_beat_preset(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        metadata = payload.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        preset = metadata.get("preset")
        preset = preset if isinstance(preset, dict) else {}
        if preset.get("scope") != "beat":
            return payload

        try:
            episode = int(preset.get("episode") or 0)
            beat = int(preset.get("beat") or 0)
        except (TypeError, ValueError):
            return payload
        if episode <= 0 or beat <= 0:
            return payload

        primary_slot = str(preset.get("primary_slot") or "").strip() or "render"
        try:
            store = await self._store_factory(context)
            try:
                preset_context = await self._beat_preset_context_builder(
                    project_id=context.project_id,
                    username=context.owner_username,
                    project=context.project_name,
                    project_dir=project_dir,
                    store=store,
                    episode=episode,
                    beat=beat,
                    primary_slot=primary_slot,
                )
            finally:
                close = getattr(store, "close", None)
                if close:
                    result = close()
                    if inspect.isawaitable(result):
                        await result

            fresh_payload = self._canvas_payload_builder(
                context=preset_context,
                preset_key=str(preset.get("preset_key") or ""),
                default_push_target={
                    "kind": "sketch" if primary_slot == "sketch" else "frame",
                    "episode": episode,
                    "beat": beat,
                },
                created_at=str(preset.get("created_at") or self._utc_now()),
            )
            merged = merge_restored_preset_canvas(fresh_payload, payload)
            for key in _PRESERVED_REFRESH_FIELDS:
                if key in payload:
                    merged[key] = payload[key]
            stamp_canvas_mainline_context_project_id(
                merged,
                context.project_id,
            )
            sync_frame_context_reference_edges(merged)
            return merged
        except Exception as exc:  # noqa: BLE001 - stale payload is still readable
            logger.warning(
                "failed to refresh beat preset canvas from mainline: ep=%s beat=%s: %s",
                episode,
                beat,
                exc,
            )
            return payload


__all__ = ["LocalCreativeCanvasDocumentQueryGateway"]

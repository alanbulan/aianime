"""Local adapters for Creative Canvas projected subgraphs."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from ai_anime.freezone import canvas_store
from ai_anime.freezone.canvas_lock import CanvasLockBusy
from ai_anime.modules.creative_canvas.application.canvas_projections import (
    CreativeCanvasProjectionBuild,
    CreativeCanvasProjectionCanvasNotFound,
    CreativeCanvasProjectionMutationResult,
    ProjectCreativeCanvasProjectionCommand,
    RemoveCreativeCanvasProjectionCommand,
)
from ai_anime.modules.creative_canvas.application.canvas_presets import (
    CreativeCanvasPresetBuilder,
)
from ai_anime.modules.creative_canvas.domain import (
    merge_projected_preset_canvas,
    preset_facts_signature,
    prepare_creative_canvas_payload_for_write,
    projection_facts_signature_from_payload,
    projection_group_label,
    remove_projected_preset_canvas,
    stamp_projection_key,
    stamp_projection_metadata,
    wrap_projection_payload_in_group,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_writes import (
    translate_canvas_store_error,
)
from ai_anime.modules.project_workspace.public import ProjectContext


SaveCanvas = Callable[..., canvas_store.CanvasSaveResult]
ReadCanvas = Callable[[Path, str], dict | None]
RequestHash = Callable[[dict], str]
UtcNow = Callable[[], str]


class LocalCreativeCanvasProjectionGateway:
    def __init__(
        self,
        preset_builder: CreativeCanvasPresetBuilder,
        *,
        save_canvas: SaveCanvas | None = None,
        read_canvas: ReadCanvas | None = None,
        request_hash: RequestHash | None = None,
        utc_now: UtcNow | None = None,
    ) -> None:
        self._preset_builder = preset_builder
        self._save_canvas = save_canvas
        self._read_canvas = read_canvas
        self._request_hash = request_hash
        self._utc_now = utc_now

    async def build_projection(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        request: Mapping[str, Any],
    ) -> CreativeCanvasProjectionBuild:
        projection_request = dict(request)
        plan = self._preset_builder.plan(projection_request)
        preset = await self._preset_builder.build(
            context=context,
            project_dir=project_dir,
            plan=plan,
        )
        payload = dict(preset.payload)
        projection_key = str(projection_request["projection_key"])
        stamp_projection_key(payload, projection_key)
        wrap_projection_payload_in_group(
            payload,
            projection_key=projection_key,
            label=projection_group_label(projection_request),
        )
        facts_signature = preset_facts_signature(payload)
        stamp_projection_metadata(
            payload,
            projection_key=projection_key,
            preset_key=plan.preset_key,
            request=projection_request,
            facts_signature=facts_signature,
            last_synced_at=self._now(),
        )
        return CreativeCanvasProjectionBuild(
            payload=payload,
            request=projection_request,
            preset_key=plan.preset_key,
            facts_signature=facts_signature,
        )

    def project(
        self,
        command: ProjectCreativeCanvasProjectionCommand,
        projection: CreativeCanvasProjectionBuild,
    ) -> CreativeCanvasProjectionMutationResult:
        state_dir = Path(command.context.state_dir)
        projection_key = str(projection.request["projection_key"])

        def skip_if_same_projection_facts(
            existing_payload: dict | None,
        ) -> dict | None:
            if command.force_refresh:
                return None
            if (
                projection_facts_signature_from_payload(
                    existing_payload,
                    projection_key,
                )
                != projection.facts_signature
            ):
                return None
            revision = (
                existing_payload.get("revision")
                if isinstance(existing_payload, dict)
                else None
            )
            updated_at = (
                existing_payload.get("updated_at")
                if isinstance(existing_payload, dict)
                else None
            )
            return {
                "saved": False,
                "revision": revision if isinstance(revision, int) else None,
                "updated_at": updated_at if isinstance(updated_at, str) else None,
                "client_save_id": None,
                "noop_reason": "projection_facts_unchanged",
            }

        def build_payload(existing_payload: dict | None) -> dict:
            raw_payload = merge_projected_preset_canvas(
                incoming_payload=dict(projection.payload),
                existing_payload=existing_payload,
                projection_key=projection_key,
            )
            stamp_projection_metadata(
                raw_payload,
                projection_key=projection_key,
                preset_key=projection.preset_key,
                request=projection.request,
                facts_signature=projection.facts_signature,
                last_synced_at=self._now(),
            )
            return prepare_creative_canvas_payload_for_write(
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                incoming=raw_payload,
                existing=existing_payload,
                actor_id=command.actor_id,
                updated_at=self._now(),
            )

        stable_hash = self._hash(
            {
                "projection_key": projection_key,
                "scope": projection.request["scope"],
                "episode": projection.request.get("episode"),
                "beat": projection.request.get("beat"),
                "primary_slot": projection.request.get("primary_slot"),
                "asset_kind": projection.request.get("asset_kind"),
                "character": projection.request.get("character"),
                "identity_id": projection.request.get("identity_id"),
                "asset_id": projection.request.get("asset_id"),
                "canvas_id": command.canvas_id,
                "base_revision": command.base_revision,
                "force_refresh": command.force_refresh,
            }
        )
        try:
            saved_canvas = (self._save_canvas or canvas_store.save_canvas)(
                state_dir,
                command.canvas_id,
                base_revision=command.base_revision,
                client_save_id=f"projection:{command.canvas_id}:{stable_hash}",
                request_hash=stable_hash,
                build_payload=build_payload,
                skip_if=skip_if_same_projection_facts,
                enforce_revision=True,
                save_source="from_preset",
                allow_empty_overwrite=True,
            )
        except (canvas_store.CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        payload = saved_canvas.payload
        response_cache = (
            saved_canvas.response_cache
            if isinstance(saved_canvas.response_cache, dict)
            else {}
        )
        revision = payload.get("revision")
        no_op = response_cache.get("noop_reason") == "projection_facts_unchanged"
        saved = response_cache.get("saved")
        return CreativeCanvasProjectionMutationResult(
            response={
                "canvas_id": command.canvas_id,
                "projection_key": projection_key,
                "revision": revision if isinstance(revision, int) else None,
                "saved": bool(saved) if isinstance(saved, bool) else True,
                "no_op": no_op,
            },
            event_type="canvas.projection_emitted",
            event_payload={
                "scope": projection.request["scope"],
                "preset_key": projection.preset_key,
                "projection_key": projection_key,
                "revision": revision,
                "node_count": len(payload.get("nodes") or []),
                "edge_count": len(payload.get("edges") or []),
                "backup_path": (
                    canvas_store.relative_project_path(
                        state_dir,
                        saved_canvas.backup_path,
                    )
                    if saved_canvas.backup_path
                    else None
                ),
                "projection_facts_unchanged": no_op,
            },
        )

    def remove(
        self,
        command: RemoveCreativeCanvasProjectionCommand,
    ) -> CreativeCanvasProjectionMutationResult:
        state_dir = Path(command.context.state_dir)

        def skip_if_projection_missing(
            existing_payload: dict | None,
        ) -> dict | None:
            if not isinstance(existing_payload, dict):
                return None
            metadata = existing_payload.get("metadata")
            projections = (
                metadata.get("projections") if isinstance(metadata, dict) else None
            )
            if isinstance(projections, dict) and command.projection_key in projections:
                return None
            revision = existing_payload.get("revision")
            updated_at = existing_payload.get("updated_at")
            return {
                "saved": False,
                "revision": revision if isinstance(revision, int) else None,
                "updated_at": updated_at if isinstance(updated_at, str) else None,
                "client_save_id": None,
                "noop_reason": "projection_missing",
            }

        def build_payload(existing_payload: dict | None) -> dict:
            if not isinstance(existing_payload, dict):
                raise CreativeCanvasProjectionCanvasNotFound()
            raw_payload = remove_projected_preset_canvas(
                existing_payload=existing_payload,
                projection_key=command.projection_key,
            )
            return prepare_creative_canvas_payload_for_write(
                project_id=command.project_id,
                canvas_id=command.canvas_id,
                incoming=raw_payload,
                existing=existing_payload,
                actor_id=command.actor_id,
                updated_at=self._now(),
            )

        stable_hash = self._hash(
            {
                "projection_key": command.projection_key,
                "canvas_id": command.canvas_id,
                "base_revision": command.base_revision,
            }
        )
        try:
            saved_canvas = (self._save_canvas or canvas_store.save_canvas)(
                state_dir,
                command.canvas_id,
                base_revision=command.base_revision,
                client_save_id=(f"projection-remove:{command.canvas_id}:{stable_hash}"),
                request_hash=stable_hash,
                build_payload=build_payload,
                skip_if=skip_if_projection_missing,
                enforce_revision=True,
                save_source="projection_remove",
                allow_empty_overwrite=True,
            )
        except (canvas_store.CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        payload = saved_canvas.payload
        response_cache = (
            saved_canvas.response_cache
            if isinstance(saved_canvas.response_cache, dict)
            else {}
        )
        revision = payload.get("revision")
        no_op = response_cache.get("noop_reason") == "projection_missing"
        return CreativeCanvasProjectionMutationResult(
            response={
                "canvas_id": command.canvas_id,
                "projection_key": command.projection_key,
                "revision": revision if isinstance(revision, int) else None,
                "saved": not no_op,
                "no_op": no_op,
            },
            event_type="canvas.projection_removed",
            event_payload={
                "projection_key": command.projection_key,
                "revision": revision,
                "node_count": len(payload.get("nodes") or []),
                "edge_count": len(payload.get("edges") or []),
                "projection_missing": no_op,
            },
        )

    def read_document(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
    ) -> Mapping[str, Any] | None:
        try:
            return (self._read_canvas or canvas_store.read_canvas)(
                Path(context.state_dir),
                canvas_id,
            )
        except (canvas_store.CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

    def _hash(self, payload: dict[str, Any]) -> str:
        return (self._request_hash or canvas_store.canvas_request_hash)(payload)

    def _now(self) -> str:
        return (self._utc_now or canvas_store.utc_now_iso)()


__all__ = ["LocalCreativeCanvasProjectionGateway"]

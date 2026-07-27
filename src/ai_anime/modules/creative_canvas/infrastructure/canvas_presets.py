"""Local preset construction and persistence for Creative Canvas."""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any

from ai_anime.freezone import canvas_store
from ai_anime.freezone.canvas_lock import CanvasLockBusy
from ai_anime.freezone.presets import (
    build_asset_preset_context,
    build_beat_preset_context,
    build_canvas_payload_from_context,
    build_episode_preset_context,
    canvas_id_for_preset,
    preset_key_for_request,
)
from ai_anime.modules.creative_canvas.application.canvas_presets import (
    CreateCreativeCanvasPresetCommand,
    CreativeCanvasPresetBuild,
    CreativeCanvasPresetCanvasNotFound,
    CreativeCanvasPresetMismatch,
    CreativeCanvasPresetMutationResult,
    CreativeCanvasPresetPlan,
    CreativeCanvasPresetSourceNotFound,
    InvalidCreativeCanvasPresetRequest,
)
from ai_anime.modules.creative_canvas.domain import (
    default_push_target_for_preset,
    merge_restored_preset_canvas,
    preset_facts_signature,
    preset_facts_signature_from_payload,
    prepare_creative_canvas_payload_for_write,
    stamp_preset_facts_signature,
)
from ai_anime.modules.creative_canvas.infrastructure.canvas_writes import (
    translate_canvas_store_error,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)


StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
PresetContextBuilder = Callable[..., Awaitable[dict[str, Any]]]
CanvasPayloadBuilder = Callable[..., dict[str, Any]]
SaveCanvas = Callable[..., canvas_store.CanvasSaveResult]
ReadCanvas = Callable[[Path, str], dict | None]
LatestPresetCanvas = Callable[[Path, str], str | None]
RequestHash = Callable[[dict], str]
UtcNow = Callable[[], str]


class LocalCreativeCanvasPresetBuilder:
    def __init__(
        self,
        *,
        store_factory: StoreFactory | None = None,
        episode_context_builder: PresetContextBuilder | None = None,
        beat_context_builder: PresetContextBuilder | None = None,
        asset_context_builder: PresetContextBuilder | None = None,
        canvas_payload_builder: CanvasPayloadBuilder | None = None,
        utc_now: UtcNow | None = None,
    ) -> None:
        self._store_factory = store_factory
        self._episode_context_builder = episode_context_builder
        self._beat_context_builder = beat_context_builder
        self._asset_context_builder = asset_context_builder
        self._canvas_payload_builder = canvas_payload_builder
        self._utc_now = utc_now

    def plan(self, request: Mapping[str, Any]) -> CreativeCanvasPresetPlan:
        preset_request = dict(request)
        try:
            preset_key = preset_key_for_request(
                scope=str(preset_request["scope"]),
                episode=preset_request.get("episode"),
                beat=preset_request.get("beat"),
                primary_slot=preset_request.get("primary_slot"),
                asset_kind=preset_request.get("asset_kind"),
                character=preset_request.get("character"),
                identity_id=preset_request.get("identity_id"),
                asset_id=preset_request.get("asset_id"),
            )
        except (KeyError, ValueError) as exc:
            raise InvalidCreativeCanvasPresetRequest(str(exc)) from exc
        return CreativeCanvasPresetPlan(
            request=preset_request,
            preset_key=preset_key,
            canonical_canvas_id=canvas_id_for_preset(preset_key),
        )

    async def build(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        plan: CreativeCanvasPresetPlan,
    ) -> CreativeCanvasPresetBuild:
        request = plan.request
        scope = request["scope"]
        if scope == "blank":
            payload = {
                "nodes": [],
                "edges": [],
                "viewport": None,
                "metadata": {
                    "preset": {
                        "preset_key": plan.preset_key,
                        "scope": "blank",
                        "created_at": self._now(),
                    }
                },
            }
            return CreativeCanvasPresetBuild(plan=plan, payload=payload)
        if scope == "episode" and request.get("episode") is None:
            raise InvalidCreativeCanvasPresetRequest("episode preset requires episode")
        if scope == "beat" and (
            request.get("episode") is None or request.get("beat") is None
        ):
            raise InvalidCreativeCanvasPresetRequest(
                "beat preset requires episode and beat"
            )
        if scope == "asset" and not request.get("asset_kind"):
            raise InvalidCreativeCanvasPresetRequest("asset preset requires asset_kind")

        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        try:
            if scope == "episode":
                preset_context = await (
                    self._episode_context_builder or build_episode_preset_context
                )(
                    project_id=context.project_id,
                    username=context.owner_username,
                    project=context.project_name,
                    project_dir=project_dir,
                    store=store,
                    episode=request["episode"],
                )
            elif scope == "beat":
                try:
                    preset_context = await (
                        self._beat_context_builder or build_beat_preset_context
                    )(
                        project_id=context.project_id,
                        username=context.owner_username,
                        project=context.project_name,
                        project_dir=project_dir,
                        store=store,
                        episode=request["episode"],
                        beat=request["beat"],
                        primary_slot=request.get("primary_slot"),
                    )
                except ValueError as exc:
                    raise CreativeCanvasPresetSourceNotFound(str(exc)) from exc
            elif scope == "asset":
                try:
                    preset_context = await (
                        self._asset_context_builder or build_asset_preset_context
                    )(
                        project_id=context.project_id,
                        username=context.owner_username,
                        project=context.project_name,
                        project_dir=project_dir,
                        store=store,
                        asset_kind=request.get("asset_kind"),
                        character=request.get("character"),
                        identity_id=request.get("identity_id"),
                        asset_id=request.get("asset_id"),
                    )
                except ValueError as exc:
                    raise InvalidCreativeCanvasPresetRequest(str(exc)) from exc
            else:
                raise InvalidCreativeCanvasPresetRequest(
                    f"unsupported preset scope: {scope}"
                )
        finally:
            close = getattr(store, "close", None)
            if close:
                closed = close()
                if inspect.isawaitable(closed):
                    await closed

        payload = (self._canvas_payload_builder or build_canvas_payload_from_context)(
            context=preset_context,
            preset_key=plan.preset_key,
            default_push_target=default_push_target_for_preset(request),
            created_at=self._now(),
        )
        if scope == "asset":
            preset_meta = payload.setdefault("metadata", {}).setdefault("preset", {})
            preset_meta.update(
                {
                    "asset_kind": request.get("asset_kind"),
                    "character": request.get("character"),
                    "identity_id": request.get("identity_id"),
                    "asset_id": request.get("asset_id"),
                }
            )
        return CreativeCanvasPresetBuild(plan=plan, payload=payload)

    def _now(self) -> str:
        return (self._utc_now or canvas_store.utc_now_iso)()


class LocalCreativeCanvasPresetGateway:
    def __init__(
        self,
        *,
        save_canvas: SaveCanvas | None = None,
        read_canvas: ReadCanvas | None = None,
        latest_preset_canvas: LatestPresetCanvas | None = None,
        request_hash: RequestHash | None = None,
        utc_now: UtcNow | None = None,
    ) -> None:
        self._save_canvas = save_canvas
        self._read_canvas = read_canvas
        self._latest_preset_canvas = latest_preset_canvas
        self._request_hash = request_hash
        self._utc_now = utc_now

    def find_reusable(
        self,
        *,
        context: ProjectContext,
        plan: CreativeCanvasPresetPlan,
    ) -> str | None:
        state_dir = Path(context.state_dir)
        canonical = (self._read_canvas or canvas_store.read_canvas)(
            state_dir,
            plan.canonical_canvas_id,
        )
        if isinstance(canonical, dict):
            preset = canonical.get("metadata")
            preset = preset.get("preset") if isinstance(preset, dict) else None
            if isinstance(preset, dict) and preset.get("preset_key") == plan.preset_key:
                return plan.canonical_canvas_id
        return (self._latest_preset_canvas or canvas_store.latest_preset_canvas)(
            state_dir,
            plan.preset_key,
        )

    def validate_overwrite(
        self,
        *,
        context: ProjectContext,
        canvas_id: str,
        plan: CreativeCanvasPresetPlan,
    ) -> None:
        existing = (self._read_canvas or canvas_store.read_canvas)(
            Path(context.state_dir),
            canvas_id,
        )
        if not isinstance(existing, dict):
            raise CreativeCanvasPresetCanvasNotFound()
        metadata = existing.get("metadata")
        if (
            self._preset_key_from_metadata(
                metadata if isinstance(metadata, dict) else None
            )
            != plan.preset_key
        ):
            raise CreativeCanvasPresetMismatch()

    def save(
        self,
        command: CreateCreativeCanvasPresetCommand,
        *,
        preset: CreativeCanvasPresetBuild,
        canvas_id: str,
        overwrite_existing: bool,
    ) -> CreativeCanvasPresetMutationResult:
        state_dir = Path(command.context.state_dir)
        payload = dict(preset.payload)
        facts_signature = preset_facts_signature(payload)
        stamp_preset_facts_signature(payload, facts_signature)

        def build_payload(existing_payload: dict | None) -> dict:
            raw_payload = (
                merge_restored_preset_canvas(payload, existing_payload)
                if overwrite_existing
                else payload
            )
            stamp_preset_facts_signature(raw_payload, facts_signature)
            return prepare_creative_canvas_payload_for_write(
                project_id=command.project_id,
                canvas_id=canvas_id,
                incoming=raw_payload,
                existing=existing_payload,
                actor_id=command.actor_id,
                updated_at=self._now(),
            )

        def skip_if_same_preset_facts(
            existing_payload: dict | None,
        ) -> dict | None:
            if not overwrite_existing:
                return None
            if preset_facts_signature_from_payload(existing_payload) != facts_signature:
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
                "noop_reason": "preset_facts_unchanged",
            }

        request = preset.plan.request
        stable_hash = (self._request_hash or canvas_store.canvas_request_hash)(
            {
                "scope": request["scope"],
                "episode": request.get("episode"),
                "beat": request.get("beat"),
                "primary_slot": request.get("primary_slot"),
                "asset_kind": request.get("asset_kind"),
                "character": request.get("character"),
                "identity_id": request.get("identity_id"),
                "asset_id": request.get("asset_id"),
                "canvas_id": canvas_id if overwrite_existing else "",
                "base_revision": command.base_revision,
            }
        )
        try:
            saved_canvas = (self._save_canvas or canvas_store.save_canvas)(
                state_dir,
                canvas_id,
                base_revision=command.base_revision,
                client_save_id=f"from-preset:{canvas_id}:{stable_hash}",
                request_hash=stable_hash,
                build_payload=build_payload,
                skip_if=skip_if_same_preset_facts,
                enforce_revision=True,
                save_source="from_preset",
                allow_empty_overwrite=True,
            )
        except (canvas_store.CanvasStoreError, CanvasLockBusy) as exc:
            raise translate_canvas_store_error(exc) from exc

        saved_payload = saved_canvas.payload
        facts_unchanged = (
            isinstance(saved_canvas.response_cache, dict)
            and saved_canvas.response_cache.get("noop_reason")
            == "preset_facts_unchanged"
        )
        return CreativeCanvasPresetMutationResult(
            response={
                "canvas_id": canvas_id,
                "reused": False,
                "url": f"/?p={command.project_id}&canvas={canvas_id}",
            },
            event_type="canvas.preset_emitted",
            event_payload={
                "scope": request["scope"],
                "preset_key": preset.plan.preset_key,
                "revision": saved_payload.get("revision"),
                "node_count": len(saved_payload.get("nodes") or []),
                "edge_count": len(saved_payload.get("edges") or []),
                "overwrote_existing": overwrite_existing,
                "backup_path": (
                    canvas_store.relative_project_path(
                        state_dir,
                        saved_canvas.backup_path,
                    )
                    if saved_canvas.backup_path
                    else None
                ),
                "preset_facts_unchanged": facts_unchanged,
            },
        )

    @staticmethod
    def _preset_key_from_metadata(metadata: Mapping[str, Any] | None) -> str | None:
        if not isinstance(metadata, Mapping):
            return None
        preset = metadata.get("preset")
        if not isinstance(preset, Mapping):
            return None
        existing = preset.get("preset_key")
        if isinstance(existing, str) and existing.strip():
            return existing.strip()
        scope = preset.get("scope")
        if not isinstance(scope, str) or not scope:
            return None
        try:
            return preset_key_for_request(
                scope=scope,
                episode=(
                    preset.get("episode")
                    if isinstance(preset.get("episode"), int)
                    else None
                ),
                beat=(
                    preset.get("beat") if isinstance(preset.get("beat"), int) else None
                ),
                primary_slot=(
                    preset.get("primary_slot")
                    if isinstance(preset.get("primary_slot"), str)
                    else None
                ),
                asset_kind=(
                    preset.get("asset_kind")
                    if isinstance(preset.get("asset_kind"), str)
                    else None
                ),
                character=(
                    preset.get("character")
                    if isinstance(preset.get("character"), str)
                    else None
                ),
                identity_id=(
                    preset.get("identity_id")
                    if isinstance(preset.get("identity_id"), str)
                    else None
                ),
                asset_id=(
                    preset.get("asset_id")
                    if isinstance(preset.get("asset_id"), str)
                    else None
                ),
            )
        except ValueError:
            return None

    def _now(self) -> str:
        return (self._utc_now or canvas_store.utc_now_iso)()


__all__ = [
    "LocalCreativeCanvasPresetBuilder",
    "LocalCreativeCanvasPresetGateway",
]

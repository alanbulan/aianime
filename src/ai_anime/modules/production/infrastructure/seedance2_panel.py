"""Seedance2 panel read model and reference-asset adapters."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSource,
    ProductionRuntimePropMenuSource,
)
from ai_anime.modules.production.application.seedance2_panel import (
    CropSeedance2AssetCommand,
    RemoveSeedance2AssetCommand,
    Seedance2PanelBeatMissing,
    Seedance2PanelQuery,
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.production.application.seedance2_config import (
    parse_seedance2_config,
)
from ai_anime.modules.production.domain.seedance2_dialogue import (
    normalize_seedance2_audio_type,
)
from ai_anime.modules.production.infrastructure import seedance2_panel_service
from ai_anime.modules.production.infrastructure.seedance2_voice_references import (
    dialogue_voice_reference_rows,
    resolve_narrator_reference_status,
)
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.path_resolver import PathResolver

_PanelRequest = (
    Seedance2PanelQuery
    | UploadSeedance2AssetCommand
    | RemoveSeedance2AssetCommand
    | CropSeedance2AssetCommand
    | TrimSeedance2AudioAssetCommand
)


@dataclass(frozen=True)
class _PanelSession:
    context: ProjectContext
    request: _PanelRequest
    store: Any
    output_dir: Path
    beats: list[dict[str, Any]]
    beat: dict[str, Any]
    next_beat: dict[str, Any] | None
    characters: list[Any]
    prop_menu: list[dict[str, Any]]


def _asset_status_payload(
    asset: Any,
    *,
    project_context: ProjectContext,
    output_dir: Path,
) -> dict[str, Any]:
    try:
        relative_path = str(Path(asset.path).relative_to(output_dir))
    except ValueError:
        relative_path = str(asset.path)
    absolute_path = str(asset.path)
    crop_source_path = getattr(asset, "crop_source_path", None)
    crop_source_absolute_path = str(crop_source_path) if crop_source_path else ""
    crop_source_relative_path = ""
    if crop_source_path:
        try:
            crop_source_relative_path = str(
                Path(crop_source_path).relative_to(output_dir)
            )
        except ValueError:
            crop_source_relative_path = crop_source_absolute_path

    media_url = ""
    if bool(asset.exists):
        media_url = project_media.make_project_static_url(
            project_context,
            relative_path,
            local_path=Path(asset.path),
        )
    crop_source_url = ""
    if crop_source_path and Path(crop_source_path).exists():
        crop_source_url = project_media.make_project_static_url(
            project_context,
            crop_source_relative_path,
            local_path=Path(crop_source_path),
        )
    can_delete = (
        str(asset.key).startswith(("user_image:", "user_audio:"))
        or "seedance2_uploads" in Path(absolute_path).parts
        or "seedance2_crops" in Path(absolute_path).parts
    )
    return {
        "key": str(asset.key),
        "label": str(asset.label),
        "media_type": str(asset.media_type),
        "selected": bool(asset.selected),
        "exists": bool(asset.exists),
        "reference_label": str(asset.reference_label),
        "note": str(asset.note or asset.validation_error or ""),
        "identity_id": str(getattr(asset, "identity_id", "") or ""),
        "prop_id": str(getattr(asset, "prop_id", "") or ""),
        "prop_scope": str(getattr(asset, "prop_scope", "") or ""),
        "path": relative_path,
        "url": media_url,
        "abs_path": absolute_path,
        "crop_source_path": crop_source_relative_path,
        "crop_source_abs_path": crop_source_absolute_path,
        "crop_source_url": crop_source_url,
        "validation_error": str(asset.validation_error or ""),
        "fallback_text": str(asset.fallback_text or ""),
        "can_crop": bool(asset.exists and asset.media_type == "image"),
        "can_trim": bool(asset.exists and asset.media_type == "audio"),
        "can_delete": can_delete,
    }


def _returned_last_frame_status_payload(
    *,
    project_context: ProjectContext,
    output_dir: Path,
    episode_num: int,
    beat_num: int,
    enabled: bool,
) -> dict[str, Any] | None:
    if not enabled:
        return None
    base_path = (
        output_dir
        / "videos"
        / "beats"
        / f"ep{episode_num:03d}"
        / "returned_last_frames"
        / f"beat_{beat_num:02d}"
    )
    path = next(
        (
            base_path.with_suffix(suffix)
            for suffix in (".png", ".jpg", ".jpeg", ".webp", ".gif")
            if base_path.with_suffix(suffix).exists()
        ),
        base_path.with_suffix(".png"),
    )
    if not path.exists():
        return None
    try:
        relative_path = path.relative_to(output_dir).as_posix()
    except ValueError:
        relative_path = str(path)
    return {
        "key": "returned_last_frame",
        "label": f"返回尾帧 · Beat {beat_num}",
        "media_type": "image",
        "selected": False,
        "exists": True,
        "reference_label": "尾帧",
        "note": "Seedance2 返回尾帧",
        "identity_id": "",
        "prop_id": "",
        "prop_scope": "",
        "path": relative_path,
        "url": project_media.make_project_static_url(
            project_context,
            relative_path,
            local_path=path,
        ),
        "abs_path": str(path),
        "validation_error": "",
        "fallback_text": "",
        "can_crop": False,
        "can_delete": False,
    }


def _voice_status_payload(
    *,
    beat: dict[str, Any],
    characters: list[Any],
    username: str,
    project: str,
    store: Any,
    output_dir: Path,
) -> dict[str, Any]:
    audio_type = normalize_seedance2_audio_type(beat)
    if audio_type == "silence":
        return {
            "required": False,
            "ready": True,
            "label": "无音频",
            "detail": "静音 Beat 不生成音频",
            "speaker": "",
        }
    if audio_type == "dialogue":
        rows = dialogue_voice_reference_rows(
            beat,
            characters=characters,
            project_dir=output_dir,
        )
        ready_rows = [row for row in rows if row.status.active_reference_path]
        names = [row.display_name or row.speaker for row in rows]
        ready = bool(rows) and len(ready_rows) == len(rows)
        return {
            "required": True,
            "ready": ready,
            "label": "声线就绪" if ready else "声线缺失",
            "detail": "、".join(names) if names else "未指定 speaker",
            "speaker": str(beat.get("speaker") or ""),
        }

    status = resolve_narrator_reference_status(
        store=store,
        username=username,
        project=project,
    )
    return {
        "required": True,
        "ready": bool(status.active_reference_path),
        "label": "声线就绪" if status.active_reference_path else "声线缺失",
        "detail": str(status.detail or status.error or "第三人称项目解说声线未配置"),
        "speaker": "NARRATOR",
    }


class LocalSeedance2PanelGateway:
    def __init__(
        self,
        episode_source: ProductionEpisodeSource,
        prop_menu_source: ProductionRuntimePropMenuSource,
    ) -> None:
        self._episode_source = episode_source
        self._prop_menu_source = prop_menu_source

    @asynccontextmanager
    async def _session(
        self,
        context: ProjectContext,
        request: _PanelRequest,
    ) -> AsyncIterator[_PanelSession]:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(request.episode_num)
            beat = next(
                (
                    item
                    for item in beats
                    if int(item.get("beat_number") or 0) == request.beat_num
                ),
                None,
            )
            if beat is None:
                raise Seedance2PanelBeatMissing(request.beat_num)
            next_beat = next(
                (
                    item
                    for item in beats
                    if int(item.get("beat_number") or 0) == request.beat_num + 1
                ),
                None,
            )
            episode = self._episode_source.episode_or_none(
                store,
                request.episode_num,
            )
            prop_menu = await self._prop_menu_source.for_episode(
                store,
                episode,
                beats,
            )
            yield _PanelSession(
                context=context,
                request=request,
                store=store,
                output_dir=Path(context.output_dir),
                beats=beats,
                beat=beat,
                next_beat=next_beat,
                characters=store.get_all_characters(),
                prop_menu=prop_menu,
            )
        finally:
            await store.close()

    def _status_response(self, session: _PanelSession) -> dict[str, Any]:
        request = session.request
        state = seedance2_panel_service.build_seedance2_video_panel_state(
            project_dir=session.output_dir,
            episode=request.episode_num,
            beat=session.beat,
            next_beat=session.next_beat,
            characters=session.characters,
            prop_menu=session.prop_menu,
        )
        assets = state.assets
        selected_assets = [asset for asset in assets if asset.selected]
        missing_assets = [
            asset
            for asset in assets
            if asset.required and (not asset.exists or bool(asset.validation_error))
        ]
        fallback_assets = [
            asset
            for asset in assets
            if str(asset.fallback_text or "").strip() and not asset.selected
        ]
        paths = PathResolver(session.output_dir, request.episode_num)
        asset_items = [
            _asset_status_payload(
                asset,
                project_context=session.context,
                output_dir=session.output_dir,
            )
            for asset in assets
        ]
        try:
            config = parse_seedance2_config(
                session.beat.get("seedance2_config_json") or "{}"
            )
            returned_last_frame = _returned_last_frame_status_payload(
                project_context=session.context,
                output_dir=session.output_dir,
                episode_num=request.episode_num,
                beat_num=request.beat_num,
                enabled=bool(config.return_last_frame),
            )
        except Exception:
            returned_last_frame = None
        if returned_last_frame is not None:
            asset_items.append(returned_last_frame)

        return {
            "ok": True,
            "data": {
                "beat_number": request.beat_num,
                "audio_type": normalize_seedance2_audio_type(session.beat),
                "seedance2_config_json": str(
                    session.beat.get("seedance2_config_json") or ""
                ),
                "media": {
                    "render_ready": paths.frame(request.beat_num).exists(),
                    "audio_ready": paths.audio(request.beat_num).exists(),
                    "video_ready": paths.video(request.beat_num).exists(),
                },
                "voice": _voice_status_payload(
                    beat=session.beat,
                    characters=session.characters,
                    username=session.context.owner_username,
                    project=request.project,
                    store=session.store,
                    output_dir=session.output_dir,
                ),
                "prompt": {
                    "ready": bool(str(state.final_prompt or "").strip()),
                    "source": str(state.prompt_source or ""),
                    "status": str(state.prompt_status or ""),
                    "has_guidance": bool(str(state.prompt_guidance or "").strip()),
                    "text_overlay_enabled": bool(
                        (state.text_overlay or {}).get("enabled")
                    ),
                    "text_overlay": state.text_overlay or {},
                    "inputs_stale": bool(
                        state.prompt_inputs_hash
                        and state.prompt_inputs_hash
                        != state.current_prompt_inputs_hash
                    ),
                },
                "assets": {
                    "total": len(assets),
                    "selected": len(selected_assets),
                    "missing": len(missing_assets),
                    "images": len(
                        [
                            asset
                            for asset in selected_assets
                            if asset.media_type == "image"
                        ]
                    ),
                    "audios": len(
                        [
                            asset
                            for asset in selected_assets
                            if asset.media_type == "audio"
                        ]
                    ),
                    "fallbacks": len(fallback_assets),
                    "items": asset_items,
                },
            },
        }

    async def status(
        self,
        context: ProjectContext,
        query: Seedance2PanelQuery,
    ) -> dict[str, Any]:
        async with self._session(context, query) as session:
            return self._status_response(session)

    async def upload(
        self,
        context: ProjectContext,
        command: UploadSeedance2AssetCommand,
    ) -> dict[str, Any] | None:
        async with self._session(context, command) as session:
            target = await seedance2_panel_service.save_seedance2_uploaded_asset(
                store=session.store,
                episode=command.episode_num,
                beat=session.beat,
                project_dir=session.output_dir,
                filename=command.filename,
                content=command.content,
                content_type=command.content_type,
            )
            return self._status_response(session) if target is not None else None

    async def remove(
        self,
        context: ProjectContext,
        command: RemoveSeedance2AssetCommand,
    ) -> dict[str, Any] | None:
        async with self._session(context, command) as session:
            removed = await seedance2_panel_service.remove_seedance2_uploaded_asset(
                store=session.store,
                episode=command.episode_num,
                beat=session.beat,
                media_kind=command.media_kind,
                path=command.path,
            )
            return self._status_response(session) if removed else None

    async def crop(
        self,
        context: ProjectContext,
        command: CropSeedance2AssetCommand,
    ) -> dict[str, Any] | None:
        async with self._session(context, command) as session:
            target = await seedance2_panel_service.crop_seedance2_asset_to_reference(
                store=session.store,
                episode=command.episode_num,
                beat=session.beat,
                project_dir=session.output_dir,
                asset_key=command.asset_key,
                source_path=command.source_path,
                crop_data=command.crop_data,
            )
            return self._status_response(session) if target is not None else None

    async def trim_audio(
        self,
        context: ProjectContext,
        command: TrimSeedance2AudioAssetCommand,
    ) -> dict[str, Any] | None:
        async with self._session(context, command) as session:
            target = await seedance2_panel_service.trim_seedance2_audio_to_reference(
                store=session.store,
                episode=command.episode_num,
                beat=session.beat,
                project_dir=session.output_dir,
                asset_key=command.asset_key,
                source_path=command.source_path,
                start_seconds=command.start_seconds,
                duration_seconds=command.duration_seconds,
            )
            return self._status_response(session) if target is not None else None

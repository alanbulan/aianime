"""Local asset-catalog and director-stage adapters for Creative Canvas."""

from __future__ import annotations

import inspect
import logging
import os
import shutil
from collections.abc import Awaitable, Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from ai_anime.director_world import DirectorWorldService
from ai_anime.freezone import canvas_store
from ai_anime.freezone.canvas_static_urls import migrate_canvas_static_urls_in_memory
from ai_anime.freezone.paths import freezone_root
from ai_anime.freezone.presets import build_beat_preset_context
from ai_anime.modules.narrative_planning.public import beat_scene_id
from ai_anime.modules.creative_canvas.application.canvas_assets import (
    CreativeCanvasBeatNotFound,
)
from ai_anime.modules.creative_canvas.domain.audio_library import (
    CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS,
)
from ai_anime.modules.creative_canvas.domain.canvas_assets import (
    is_creative_canvas_scene_library_role,
    project_creative_canvas_asset_record,
    project_creative_canvas_beat_context_asset,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import make_sqlite_store_for_context
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.utils.path_resolver import (
    canonical_beat_director_env_only_path,
    canonical_beat_selected_background_path,
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)


logger = logging.getLogger(__name__)

StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
StaticUrlBuilder = Callable[[ProjectContext, str, Path | None], str]
BeatContextBuilder = Callable[..., Awaitable[dict[str, Any]]]
CanvasStaticUrlMigrator = Callable[..., dict[str, Any] | None]

DIRECTOR_CAPTURE_FILES: tuple[tuple[str, str, str], ...] = (
    ("combined.png", "director_combined", "3GS 导演合成图"),
    ("selected_background.png", "selected_background", "selected background"),
    ("env_only.png", "director_env", "3GS environment plate"),
    ("env_actor_only.png", "director_env_actor", "3GS actor blocking plate"),
    ("actor_overlay_black.png", "actor_overlay", "actor overlay"),
    ("actor_mask.png", "actor_mask", "actor mask"),
    ("prop_staging_overlay.png", "prop_staging_overlay", "prop/staging overlay"),
    ("prop_staging_mask.png", "prop_staging_mask", "prop/staging mask"),
    ("frame_meta.json", "frame_meta", "3GS frame metadata"),
)


class LocalCreativeCanvasAssetRecordFactory:
    def __init__(self, static_url_builder: StaticUrlBuilder | None = None) -> None:
        self._static_url_builder = static_url_builder

    def from_path(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        project_id: str,
        tab: str,
        kind: str,
        role: str,
        label: str,
        abs_path: Path,
        sublabel: str = "",
        aspect_ratio: str = "1:1",
        meta: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        relative_path = abs_path.relative_to(project_dir).as_posix()
        exists = abs_path.exists()
        if exists and not project_id:
            raise ValueError("project_id is required for freezone asset static URLs")
        url = (
            (self._static_url_builder or make_static_url_for_context)(
                context,
                relative_path,
                abs_path,
            )
            if exists
            else None
        )
        return project_creative_canvas_asset_record(
            project_id=project_id,
            tab=tab,
            kind=kind,
            role=role,
            label=label,
            relative_path=relative_path,
            url=url,
            exists=exists,
            sublabel=sublabel,
            aspect_ratio=aspect_ratio,
            meta=meta,
        )

    def from_optional_project_path(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        project_id: str,
        tab: str,
        kind: str,
        role: str,
        label: str,
        stored_path: str,
        sublabel: str = "",
        aspect_ratio: str = "1:1",
        meta: Mapping[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        raw_path = str(stored_path or "").strip()
        if not raw_path:
            return None
        absolute_path = Path(raw_path)
        if not absolute_path.is_absolute():
            absolute_path = project_dir / raw_path
        try:
            absolute_path.relative_to(project_dir)
        except ValueError:
            return None
        return self.from_path(
            context=context,
            project_dir=project_dir,
            project_id=project_id,
            tab=tab,
            kind=kind,
            role=role,
            label=label,
            abs_path=absolute_path,
            sublabel=sublabel,
            aspect_ratio=aspect_ratio,
            meta=meta,
        )


class LocalCreativeCanvasAssetCatalogGateway:
    def __init__(
        self,
        store_factory: StoreFactory | None = None,
        record_factory: LocalCreativeCanvasAssetRecordFactory | None = None,
        beat_context_builder: BeatContextBuilder | None = None,
        canvas_static_url_migrator: CanvasStaticUrlMigrator | None = None,
    ) -> None:
        self._store_factory = store_factory
        self._record_factory = record_factory or LocalCreativeCanvasAssetRecordFactory()
        self._beat_context_builder = beat_context_builder
        self._canvas_static_url_migrator = canvas_static_url_migrator

    async def list_assets(
        self,
        *,
        context: ProjectContext,
        project_id: str,
        project_dir: Path,
    ) -> Sequence[Mapping[str, Any]]:
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        assets: list[dict[str, Any]] = []
        try:
            for character in store.get_all_characters():
                assets.append(
                    self._record_factory.from_path(
                        context=context,
                        project_dir=project_dir,
                        project_id=project_id,
                        tab="characters",
                        kind="portrait",
                        role="character_portrait",
                        label=f"{character.name} / portrait",
                        sublabel=character.name,
                        abs_path=canonical_portrait_path(project_dir, character.name),
                        aspect_ratio="1:1",
                        meta={"character": character.name},
                    )
                )
                default_voice = self._record_factory.from_optional_project_path(
                    context=context,
                    project_dir=project_dir,
                    project_id=project_id,
                    tab="characters",
                    kind="audio",
                    role="character_voice",
                    label=f"{character.name} / 默认声线",
                    sublabel=character.name,
                    stored_path=str(
                        getattr(character, "reference_audio_path", "") or ""
                    ),
                    meta={
                        "character": character.name,
                        "scope": "character_default",
                        "slot": "default",
                        "age_group": str(getattr(character, "age_group", "") or ""),
                        "sha256": str(
                            getattr(character, "reference_audio_sha256", "") or ""
                        ),
                        "updated_at": str(
                            getattr(character, "reference_audio_updated_at", "") or ""
                        ),
                    },
                )
                if default_voice is not None:
                    assets.append(default_voice)

                voice_samples = (
                    getattr(character, "voice_samples_by_age_group", None) or {}
                )
                if isinstance(voice_samples, dict):
                    for (
                        slot,
                        slot_label,
                    ) in CREATIVE_CANVAS_AUDIO_AGE_GROUP_LABELS.items():
                        entry = voice_samples.get(slot)
                        if not isinstance(entry, dict):
                            continue
                        age_voice = self._record_factory.from_optional_project_path(
                            context=context,
                            project_dir=project_dir,
                            project_id=project_id,
                            tab="characters",
                            kind="audio",
                            role="character_age_group_voice",
                            label=f"{character.name} / {slot_label}声线",
                            sublabel=character.name,
                            stored_path=str(entry.get("path", "") or ""),
                            meta={
                                "character": character.name,
                                "scope": "character_age_group",
                                "slot": slot,
                                "age_group": slot,
                                "sha256": str(entry.get("sha256", "") or ""),
                                "updated_at": str(entry.get("updated_at", "") or ""),
                            },
                        )
                        if age_voice is not None:
                            assets.append(age_voice)

                for identity in character.identities or []:
                    identity_name = (
                        getattr(identity, "identity_name", "")
                        or getattr(identity, "identity_id", "")
                        or "identity"
                    )
                    identity_id = (
                        getattr(identity, "identity_id", "")
                        or f"{character.name}_{identity_name}"
                    )
                    assets.append(
                        self._record_factory.from_path(
                            context=context,
                            project_dir=project_dir,
                            project_id=project_id,
                            tab="characters",
                            kind="identity",
                            role="character_identity",
                            label=f"{character.name} / {identity_name}",
                            sublabel=character.name,
                            abs_path=canonical_identity_path(
                                project_dir,
                                character.name,
                                identity_name,
                            ),
                            aspect_ratio="1:1",
                            meta={
                                "character": character.name,
                                "identity_id": identity_id,
                            },
                        )
                    )
                    assets.append(
                        self._record_factory.from_path(
                            context=context,
                            project_dir=project_dir,
                            project_id=project_id,
                            tab="characters",
                            kind="identity_costume",
                            role="identity_costume",
                            label=f"{character.name} / {identity_name} costume",
                            sublabel=character.name,
                            abs_path=canonical_identity_costume_path(
                                project_dir,
                                character.name,
                                identity_name,
                            ),
                            aspect_ratio="3:4",
                            meta={
                                "character": character.name,
                                "identity_id": identity_id,
                                "identity_name": identity_name,
                            },
                        )
                    )
                    assets.append(
                        self._record_factory.from_path(
                            context=context,
                            project_dir=project_dir,
                            project_id=project_id,
                            tab="characters",
                            kind="identity_portrait",
                            role="identity_portrait",
                            label=f"{character.name} / {identity_name} portrait",
                            sublabel=character.name,
                            abs_path=canonical_identity_portrait_path(
                                project_dir,
                                character.name,
                                identity_name,
                            ),
                            aspect_ratio="3:4",
                            meta={
                                "character": character.name,
                                "identity_id": identity_id,
                                "identity_name": identity_name,
                            },
                        )
                    )
                    identity_voice = self._record_factory.from_optional_project_path(
                        context=context,
                        project_dir=project_dir,
                        project_id=project_id,
                        tab="characters",
                        kind="audio",
                        role="identity_voice",
                        label=f"{character.name} / {identity_name}声线",
                        sublabel=character.name,
                        stored_path=str(
                            getattr(identity, "reference_audio_path", "") or ""
                        ),
                        meta={
                            "character": character.name,
                            "identity_id": identity_id,
                            "identity_name": identity_name,
                            "scope": "identity",
                            "age_group": str(getattr(identity, "age_group", "") or ""),
                            "sha256": str(
                                getattr(identity, "reference_audio_sha256", "") or ""
                            ),
                            "updated_at": str(
                                getattr(identity, "reference_audio_updated_at", "")
                                or ""
                            ),
                        },
                    )
                    if identity_voice is not None:
                        assets.append(identity_voice)

            for scene in await store.list_scenes():
                scene_name = scene.name
                director_pano_path = None
                stage_manifest_module = None
                try:
                    from ai_anime.director_world import stage_manifest

                    stage_manifest_module = stage_manifest
                    director_pano_path = stage_manifest.resolve_pano_path(
                        project_dir,
                        scene_name,
                    )
                except Exception:  # noqa: BLE001 - stage assets are optional
                    director_pano_path = None
                for kind, role, label, path, aspect_ratio in (
                    (
                        "scene",
                        "scene_master",
                        f"{scene_name} / master",
                        canonical_scene_master_path(project_dir, scene_name),
                        "16:9",
                    ),
                    (
                        "scene",
                        "scene_reverse_master",
                        f"{scene_name} / reverse master",
                        canonical_scene_reverse_master_path(project_dir, scene_name),
                        "16:9",
                    ),
                    (
                        "scene",
                        "scene_director_pano_360",
                        f"{scene_name} / director pano 360",
                        director_pano_path,
                        "2:1",
                    ),
                ):
                    if path is None or not is_creative_canvas_scene_library_role(role):
                        continue
                    assets.append(
                        self._record_factory.from_path(
                            context=context,
                            project_dir=project_dir,
                            project_id=project_id,
                            tab="scenes",
                            kind=kind,
                            role=role,
                            label=label,
                            sublabel=scene_name,
                            abs_path=path,
                            aspect_ratio=aspect_ratio,
                            meta={
                                "scene": scene_name,
                                "scene_id": scene_name,
                                "scene_type": scene.scene_type,
                            },
                        )
                    )
                if stage_manifest_module is not None:
                    seen_stage_asset_paths: set[str] = set()
                    for ply_kind, role, label in (
                        (
                            "master",
                            "scene_3gs_master_ply",
                            f"{scene_name} / 3D 世界（正面）",
                        ),
                        (
                            "reverse",
                            "scene_3gs_reverse_ply",
                            f"{scene_name} / 3D 世界（背面）",
                        ),
                        (
                            "pano",
                            "scene_3gs_pano_ply",
                            f"{scene_name} / 3D 世界（360）",
                        ),
                        (
                            "custom",
                            "scene_3gs_custom_scene",
                            f"{scene_name} / 3D 世界（自定义）",
                        ),
                    ):
                        ply_path = stage_manifest_module.resolve_ply_path(
                            project_dir,
                            scene_name,
                            ply_kind=ply_kind,
                        )
                        if (
                            ply_path is None
                            or not is_creative_canvas_scene_library_role(role)
                        ):
                            continue
                        relative_path = ply_path.relative_to(project_dir).as_posix()
                        if relative_path in seen_stage_asset_paths:
                            continue
                        seen_stage_asset_paths.add(relative_path)
                        assets.append(
                            self._record_factory.from_path(
                                context=context,
                                project_dir=project_dir,
                                project_id=project_id,
                                tab="scenes",
                                kind="scene",
                                role=role,
                                label=label,
                                sublabel=scene_name,
                                abs_path=ply_path,
                                aspect_ratio="1:1",
                                meta={
                                    "scene": scene_name,
                                    "scene_id": scene_name,
                                    "scene_type": scene.scene_type,
                                    "ply_kind": ply_kind,
                                },
                            )
                        )

            for prop in await store.list_props():
                assets.append(
                    self._record_factory.from_path(
                        context=context,
                        project_dir=project_dir,
                        project_id=project_id,
                        tab="props",
                        kind="prop",
                        role="prop_reference",
                        label=f"{prop.name} / reference",
                        sublabel=prop.prop_type or "object",
                        abs_path=canonical_prop_reference_path(
                            project_dir,
                            prop.name,
                        ),
                        aspect_ratio="1:1",
                        meta={"prop_id": prop.name, "prop_type": prop.prop_type},
                    )
                )
        finally:
            await _close_store(store)
        return assets

    async def list_beat_context_assets(
        self,
        *,
        context: ProjectContext,
        project_id: str,
        project_dir: Path,
        episode: int | None,
        beat: int | None,
    ) -> Mapping[str, Any]:
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        flat_assets: list[dict[str, Any]] = []
        episode_groups: list[dict[str, Any]] = []
        try:
            episode_numbers = (
                [episode]
                if episode is not None
                else await self._list_episode_numbers(store)
            )
            for episode_number in episode_numbers:
                try:
                    beats = await store.get_beats_as_dicts(episode_number)
                except Exception as exc:  # noqa: BLE001 - omit unreadable episodes
                    logger.warning(
                        "failed to load beats for asset context ep%s: %s",
                        episode_number,
                        exc,
                    )
                    beats = []
                beat_numbers = sorted(
                    {
                        int(item.get("beat_number") or 0)
                        for item in beats
                        if int(item.get("beat_number") or 0) > 0
                    }
                )
                if beat is not None:
                    beat_numbers = [number for number in beat_numbers if number == beat]

                beat_groups: list[dict[str, Any]] = []
                for beat_number in beat_numbers:
                    try:
                        preset_context = await (
                            self._beat_context_builder or build_beat_preset_context
                        )(
                            project_id=context.project_id,
                            username=context.owner_username,
                            project=context.project_name,
                            project_dir=project_dir,
                            store=store,
                            episode=episode_number,
                            beat=beat_number,
                            primary_slot="render",
                        )
                        preset_context = (
                            self._canvas_static_url_migrator
                            or migrate_canvas_static_urls_in_memory
                        )(
                            preset_context,
                            project_id=context.project_id,
                            owner_username=context.owner_username,
                            project_name=context.project_name,
                            project_dir=project_dir,
                        ) or preset_context
                    except Exception as exc:  # noqa: BLE001 - omit invalid beats
                        logger.warning(
                            "failed to build beat context assets for ep%s beat%s: %s",
                            episode_number,
                            beat_number,
                            exc,
                        )
                        continue

                    beat_data = (
                        preset_context.get("beat_data")
                        if isinstance(preset_context, Mapping)
                        else {}
                    )
                    refs = (
                        preset_context.get("refs")
                        if isinstance(preset_context, Mapping)
                        else []
                    )
                    beat_facts = {
                        "visual_description": str(
                            (beat_data or {}).get("visual_description") or ""
                        ),
                        "narration_segment": str(
                            (beat_data or {}).get("narration_segment") or ""
                        ),
                        "scene_id": beat_scene_id(beat_data or {}),
                        "detected_identities": (beat_data or {}).get(
                            "detected_identities"
                        )
                        or [],
                        "detected_props": (beat_data or {}).get("detected_props") or [],
                        "sketch_colors": (
                            (preset_context.get("sketch_context") or {}).get(
                                "sketch_colors"
                            )
                            or {}
                        ),
                        "prop_marker_colors": (
                            (preset_context.get("sketch_context") or {}).get(
                                "prop_marker_colors"
                            )
                            or {}
                        ),
                    }
                    assets = [
                        asset
                        for ref in refs or []
                        if isinstance(ref, Mapping)
                        for asset in [
                            project_creative_canvas_beat_context_asset(
                                ref=ref,
                                project_id=project_id,
                                episode=episode_number,
                                beat=beat_number,
                                beat_facts=beat_facts,
                            )
                        ]
                        if asset is not None
                    ]
                    existing_assets = [
                        asset
                        for asset in assets
                        if asset.get("exists") and asset.get("url")
                    ]
                    flat_assets.extend(existing_assets)
                    beat_groups.append(
                        {
                            "episode": episode_number,
                            "beat": beat_number,
                            "label": f"EP{episode_number} / Beat {beat_number}",
                            "scene_id": beat_facts["scene_id"],
                            "detected_identities": beat_facts["detected_identities"],
                            "detected_props": beat_facts["detected_props"],
                            "sketch_colors": beat_facts["sketch_colors"],
                            "prop_marker_colors": beat_facts["prop_marker_colors"],
                            "visual_description": str(
                                (beat_data or {}).get("visual_description") or ""
                            ),
                            "narration_segment": str(
                                (beat_data or {}).get("narration_segment") or ""
                            ),
                            "assets": assets,
                            "asset_count": len(existing_assets),
                        }
                    )
                if beat_groups:
                    episode_groups.append(
                        {"episode": episode_number, "beats": beat_groups}
                    )
        finally:
            await _close_store(store)

        return {
            "scope": {"episode": episode, "beat": beat},
            "episodes": episode_groups,
            "assets": flat_assets,
        }

    @staticmethod
    async def _list_episode_numbers(store: Any) -> list[int]:
        episodes: Sequence[Any] = []
        for method_name in ("get_all_episodes", "list_episodes"):
            method = getattr(store, method_name, None)
            if not callable(method):
                continue
            try:
                value = method()
                loaded = await value if inspect.isawaitable(value) else value
                episodes = loaded or []
            except Exception:  # noqa: BLE001 - fall back to visual beats
                episodes = []
            if episodes:
                break

        episode_numbers = _positive_int_attributes(episodes, "number")
        if episode_numbers:
            return episode_numbers
        try:
            visual_beats = await store.list_visual_beats()
        except Exception:  # noqa: BLE001 - projects may not have visual beats
            return []
        return _positive_int_attributes(visual_beats, "episode_number")


class LocalCreativeCanvasBeatSceneSource:
    def __init__(self, store_factory: StoreFactory | None = None) -> None:
        self._store_factory = store_factory

    async def scene_id(
        self,
        *,
        context: ProjectContext,
        episode: int,
        beat: int,
    ) -> str | None:
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        try:
            beats = await store.get_beats_as_dicts(episode)
        finally:
            await _close_store(store)
        selected = next(
            (item for item in beats if int(item.get("beat_number") or -1) == beat),
            None,
        )
        if not selected:
            raise CreativeCanvasBeatNotFound(f"beat not found: ep{episode} beat{beat}")
        return beat_scene_id(selected)


class LocalCreativeCanvasDirectorCaptureStorage:
    def __init__(self, static_url_builder: StaticUrlBuilder | None = None) -> None:
        self._static_url_builder = static_url_builder

    def list_files(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
    ) -> Sequence[Mapping[str, Any]]:
        base_dir = self.capture_dir(project_dir, episode, beat)
        base_relative = base_dir.relative_to(project_dir).as_posix()
        files: list[dict[str, Any]] = []
        for filename, role, label in DIRECTOR_CAPTURE_FILES:
            relative_path = f"{base_relative}/{filename}"
            path = base_dir / filename
            exists = path.exists()
            stat = path.stat() if exists else None
            files.append(
                {
                    "filename": filename,
                    "role": role,
                    "label": label,
                    "rel_path": relative_path,
                    "exists": exists,
                    "url": (
                        (self._static_url_builder or make_static_url_for_context)(
                            context,
                            relative_path,
                            path,
                        )
                        if exists
                        else None
                    ),
                    "media_type": (
                        "image"
                        if Path(filename).suffix.lower()
                        in {".png", ".jpg", ".jpeg", ".webp"}
                        else "json"
                    ),
                    "size": stat.st_size if stat else 0,
                    "modified_at": (
                        canvas_store.timestamp_utc_iso(stat.st_mtime) if stat else None
                    ),
                }
            )
        return files

    @staticmethod
    def capture_dir(project_dir: Path, episode: int, beat: int) -> Path:
        return (
            LocalCreativeCanvasDirectorCaptureStorage.control_frames_dir(project_dir)
            / f"ep{episode:03d}"
            / f"beat_{beat:02d}"
        )

    @staticmethod
    def control_frames_dir(project_dir: Path) -> Path:
        return freezone_root(project_dir) / "director_control_frames"

    @staticmethod
    def sync_background(project_dir: Path, episode: int, beat: int) -> bool:
        try:
            env_only_path = canonical_beat_director_env_only_path(
                project_dir,
                episode,
                beat,
            )
            if not env_only_path.is_file():
                return False
            selected_path = canonical_beat_selected_background_path(
                project_dir,
                episode,
                beat,
            )
            env_modified_at = env_only_path.stat().st_mtime
            if (
                selected_path.exists()
                and env_modified_at <= selected_path.stat().st_mtime
            ):
                return False
            selected_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(env_only_path, selected_path)
            os.utime(selected_path, (env_modified_at, env_modified_at))
            logger.info(
                "[director-capture] mirrored env_only to selected_background "
                "ep=%s beat=%s",
                episode,
                beat,
            )
            return True
        except Exception as exc:  # noqa: BLE001 - mirror must not block callers
            logger.warning("[director-capture] env_only mirror failed: %s", exc)
            return False

    def scene_asset_urls(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str | None,
    ) -> Mapping[str, str | None]:
        def resolve(path: Path | None) -> str | None:
            if path is None or not path.is_file():
                return None
            try:
                relative_path = path.relative_to(project_dir).as_posix()
            except ValueError:
                return None
            return (self._static_url_builder or make_static_url_for_context)(
                context,
                relative_path,
                path,
            )

        urls: dict[str, str | None] = {
            "master_url": None,
            "reverse_url": None,
            "director_env_only_url": resolve(
                canonical_beat_director_env_only_path(project_dir, episode, beat)
            ),
            "pano_360_url": None,
            "ply_url": None,
        }
        if not scene_id:
            return urls
        urls["master_url"] = resolve(canonical_scene_master_path(project_dir, scene_id))
        urls["reverse_url"] = resolve(
            canonical_scene_reverse_master_path(project_dir, scene_id)
        )
        try:
            from ai_anime.director_world import stage_manifest

            urls["pano_360_url"] = resolve(
                stage_manifest.resolve_pano_path(project_dir, scene_id)
            )
            urls["ply_url"] = resolve(
                stage_manifest.resolve_ply_path(project_dir, scene_id)
            )
        except Exception as exc:  # noqa: BLE001 - manifest issues are non-fatal
            logger.warning(
                "scene-assets-for-beat: stage_manifest lookup failed: %s", exc
            )
        return urls


class LocalCreativeCanvasDirectorStageLinkBuilder:
    @staticmethod
    def build(
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str,
        control_frames_dir: Path,
    ) -> str | None:
        try:
            return DirectorWorldService(project_dir).make_3gs_editor_url(
                episode=episode,
                scene_id=scene_id,
                slate_beat=beat,
                user=context.owner_username,
                project=context.project_name,
                control_frames_dir=control_frames_dir,
            )
        except Exception as exc:  # noqa: BLE001 - stage links are optional
            logger.warning("failed to build 3GS director stage url: %s", exc)
            return None


def _positive_int_attributes(items: Sequence[Any], attribute: str) -> list[int]:
    values: set[int] = set()
    for item in items:
        try:
            value = int(getattr(item, attribute, 0) or 0)
        except (TypeError, ValueError):
            continue
        if value > 0:
            values.add(value)
    return sorted(values)


async def _close_store(store: Any) -> None:
    close = getattr(store, "close", None)
    if not close:
        return
    closed = close()
    if inspect.isawaitable(closed):
        await closed


__all__ = [
    "LocalCreativeCanvasAssetCatalogGateway",
    "LocalCreativeCanvasAssetRecordFactory",
    "LocalCreativeCanvasBeatSceneSource",
    "LocalCreativeCanvasDirectorCaptureStorage",
    "LocalCreativeCanvasDirectorStageLinkBuilder",
]

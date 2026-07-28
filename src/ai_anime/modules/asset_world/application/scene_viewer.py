"""Scene plate, viewer manifest, and Director World application use cases."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

from ai_anime.models import (
    real_detected_identities,
    real_detected_props,
)
from ai_anime.modules.asset_world.application.dto import (
    SaveSceneDirectorWorldCommand,
    SaveSceneDirectorWorldSourceCommand,
    SceneViewerAssetState,
)
from ai_anime.modules.asset_world.application.errors import SceneViewerRejected
from ai_anime.modules.asset_world.application.ports import (
    SceneViewerAssets,
    SceneViewerRepository,
)
from ai_anime.modules.asset_world.application.scene_lookup import require_scene
from ai_anime.modules.asset_world.application.scene_models import (
    resolve_scene_plate_from_records,
)
from ai_anime.modules.asset_world.domain.scene_viewer import (
    director_palette,
    scene_plate_preview_payload,
    splat_format,
)

ViewerMode = Literal["scene", "beat"]
AssetUrl = Callable[[str | Path], str]


class SceneViewerUseCases:
    def __init__(
        self,
        assets: SceneViewerAssets,
        *,
        anonymous_actor_colors: Sequence[str],
        anonymous_prop_colors: Sequence[str],
    ) -> None:
        self._assets = assets
        self._anonymous_actor_colors = tuple(anonymous_actor_colors)
        self._anonymous_prop_colors = tuple(anonymous_prop_colors)

    async def preview_plate(
        self,
        *,
        repository: SceneViewerRepository,
        project_dir: Path,
        scene_id: object,
        variant_id: object,
        time_of_day: object,
    ) -> dict[str, Any]:
        normalized_scene_id = scene_id if isinstance(scene_id, str) else ""
        normalized_variant_id = variant_id if isinstance(variant_id, str) else ""
        normalized_time_of_day = time_of_day if isinstance(time_of_day, str) else ""
        scene_records = await repository.list_scenes()
        resolved_scene_name, time_baked = resolve_scene_plate_from_records(
            normalized_scene_id,
            normalized_variant_id,
            normalized_time_of_day,
            scene_records,
        )
        planned_scene_name = ""
        if time_baked and not self._assets.has_master(
            project_dir,
            resolved_scene_name,
        ):
            planned_scene_name = resolved_scene_name
            resolved_scene_name, _unused_time_baked = resolve_scene_plate_from_records(
                normalized_scene_id,
                normalized_variant_id,
                "",
                scene_records,
            )
            time_baked = False

        return scene_plate_preview_payload(
            scene_id=normalized_scene_id,
            variant_id=normalized_variant_id,
            time_of_day=normalized_time_of_day,
            resolved_scene_name=resolved_scene_name,
            time_baked=time_baked,
            planned_scene_name=planned_scene_name,
        )

    async def scene_pano_manifest(
        self,
        *,
        repository: SceneViewerRepository,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        manifest = self.build_pano_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene.name,
            asset_url=asset_url,
            mode="scene",
        )
        if manifest is None:
            raise SceneViewerRejected("当前场景没有 360 全景资产")
        return manifest

    def build_pano_manifest(
        self,
        *,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
        mode: ViewerMode,
        episode_num: int | None = None,
        beat_num: int | None = None,
        beat: Mapping[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        state = self._assets.load(project_dir, scene_name)
        pano_path = state.pano_path
        pano_url = asset_url(pano_path) if pano_path is not None else ""
        if pano_path is None or not pano_url:
            return None

        allowed = ["view", "download", "canvas_screenshot_node"]
        if mode == "beat":
            allowed = ["view", "download", "beat_selected_background"]
        manifest: dict[str, Any] = {
            "viewer_kind": "pano360",
            "mode": mode,
            "project": project_id,
            "scene_id": scene_name,
            "display_name": scene_name,
            "source": {
                "slot_kind": "scene_director_pano_360",
                "url": pano_url,
                "fs": self._assets.filesystem_url(pano_path),
            },
            "correction": self._pano_correction(state),
            "allowed_destinations": allowed,
        }
        beat_context = self._beat_context(
            episode_num=episode_num,
            beat_num=beat_num,
            beat=beat,
        )
        if beat_context is not None:
            manifest["beat_context"] = beat_context
        return manifest

    def beat_pano_manifest(
        self,
        *,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
        episode_num: int,
        beat_num: int,
        beat: Mapping[str, Any],
    ) -> dict[str, Any]:
        manifest = self.build_pano_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene_name,
            asset_url=asset_url,
            mode="beat",
            episode_num=episode_num,
            beat_num=beat_num,
            beat=beat,
        )
        if manifest is None:
            raise SceneViewerRejected("当前场景没有 360 全景资产")
        return manifest

    async def update_pano_correction(
        self,
        *,
        repository: SceneViewerRepository,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        correction: Mapping[str, Any],
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        self._assets.set_pano_correction(
            project_dir,
            scene.name,
            correction,
        )
        manifest = self.build_pano_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene.name,
            asset_url=asset_url,
            mode="scene",
        )
        if manifest is None:
            raise SceneViewerRejected("当前场景没有 360 全景资产")
        return manifest

    async def scene_director_stage_manifest(
        self,
        *,
        repository: SceneViewerRepository,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        manifest = self.build_director_stage_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene.name,
            asset_url=asset_url,
            mode="scene",
        )
        if manifest is None:
            raise SceneViewerRejected("当前场景没有 3GS 资产")
        return manifest

    def build_director_stage_manifest(
        self,
        *,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
        mode: ViewerMode,
        episode_num: int | None = None,
        beat_num: int | None = None,
        beat: Mapping[str, Any] | None = None,
        sketch_colors: Mapping[str, str] | None = None,
        prop_marker_colors: Mapping[str, str] | None = None,
    ) -> dict[str, Any] | None:
        state = self._assets.load(project_dir, scene_name)
        scene_world = self._scene_world(state, mode)
        has_saved_scene_world = bool(
            scene_world["active_source_id"]
            or scene_world["scene"]
            or scene_world["scenes_by_source_id"]
        )
        active_path = state.active_splat_path
        active_url = asset_url(active_path) if active_path is not None else ""
        collision_url = (
            asset_url(state.collision_path) if state.collision_path is not None else ""
        )
        pano_path = state.pano_path
        pano_url = asset_url(pano_path) if pano_path is not None else ""
        beat_context = self._beat_context(
            episode_num=episode_num,
            beat_num=beat_num,
            beat=beat,
        )
        palette = director_palette(
            beat_context,
            anonymous_actor_colors=self._anonymous_actor_colors,
            anonymous_prop_colors=self._anonymous_prop_colors,
            sketch_colors=sketch_colors,
            prop_marker_colors=prop_marker_colors,
        )
        common = self._director_manifest_common(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene_name,
            mode=mode,
            episode_num=episode_num,
            beat_num=beat_num,
            beat_context=beat_context,
            palette=palette,
            scene_world=scene_world,
        )

        if active_path is None or not active_url:
            if pano_path is None or not pano_url:
                if not has_saved_scene_world:
                    return None
                common.update(
                    source={
                        "source_type": "sog",
                        "ply_url": "",
                        "splat_url": "",
                        "splat_format": "unknown",
                        "source_kind": "custom",
                    },
                    source_options=[],
                )
                return common

            common["active_source_id"] = (
                scene_world["active_source_id"] or f"scene-pano:{scene_name}"
            )
            common.update(
                source={
                    "source_type": "pano360",
                    "ply_url": "",
                    "splat_url": "",
                    "splat_format": "unknown",
                    "pano_url": pano_url,
                    "slot_kind": "scene_director_pano_360",
                    "source_kind": "pano",
                },
                source_options=[
                    {
                        "kind": "pano",
                        "label": "360 图",
                        "source_type": "pano360",
                        "splat_format": "unknown",
                        "pano_url": pano_url,
                        "slot_kind": "scene_director_pano_360",
                        "fs": self._assets.filesystem_url(pano_path),
                        "current": True,
                    }
                ],
            )
            return common

        source = {
            "source_type": "sog",
            "ply_url": active_url,
            "splat_url": active_url,
            "splat_format": splat_format(active_path),
            "source_kind": self._active_source_kind(state, active_path),
        }
        if collision_url:
            source["collision_glb_url"] = collision_url
        common.update(
            source=source,
            source_options=self._director_source_options(
                state=state,
                active_path=active_path,
                asset_url=asset_url,
            ),
        )
        return common

    def beat_director_stage_manifest(
        self,
        *,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
        episode_num: int,
        beat_num: int,
        beat: Mapping[str, Any],
        sketch_colors: Mapping[str, str] | None = None,
        prop_marker_colors: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        manifest = self.build_director_stage_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene_name,
            asset_url=asset_url,
            mode="beat",
            episode_num=episode_num,
            beat_num=beat_num,
            beat=beat,
            sketch_colors=sketch_colors,
            prop_marker_colors=prop_marker_colors,
        )
        if manifest is None:
            raise SceneViewerRejected("当前场景没有 3GS 资产")
        return manifest

    def default_director_stage_palette(self) -> dict[str, Any]:
        return director_palette(
            None,
            anonymous_actor_colors=self._anonymous_actor_colors,
            anonymous_prop_colors=self._anonymous_prop_colors,
        )

    async def save_director_world(
        self,
        *,
        repository: SceneViewerRepository,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        command: SaveSceneDirectorWorldCommand,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        if not isinstance(command.snapshot, dict):
            raise SceneViewerRejected("snapshot is required")
        source_id = str(command.active_source_id or "").strip()
        active_source = command.active_source
        try:
            saved = self._assets.save_director_world(
                project_dir,
                scene.name,
                active_source_id=source_id,
                snapshot=command.snapshot,
                active_source=active_source if isinstance(active_source, dict) else None,
            )
        except ValueError as exc:
            raise SceneViewerRejected(str(exc)) from exc
        manifest = self.build_director_stage_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene.name,
            asset_url=asset_url,
            mode="scene",
        )
        return {**saved, "manifest": manifest}

    async def save_director_world_source(
        self,
        *,
        repository: SceneViewerRepository,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        command: SaveSceneDirectorWorldSourceCommand,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        if not isinstance(command.snapshot, dict):
            raise SceneViewerRejected("snapshot is required")
        source_id = str(command.source_id or "").strip()
        source = command.source
        try:
            saved = self._assets.save_director_world_source(
                project_dir,
                scene.name,
                source_id=source_id,
                snapshot=command.snapshot,
                source=source if isinstance(source, dict) else None,
            )
        except ValueError as exc:
            raise SceneViewerRejected(str(exc)) from exc
        manifest = self.build_director_stage_manifest(
            project_id=project_id,
            project_dir=project_dir,
            scene_name=scene.name,
            asset_url=asset_url,
            mode="scene",
        )
        return {**saved, "manifest": manifest}

    async def clear_director_world(
        self,
        *,
        repository: SceneViewerRepository,
        project_dir: Path,
        scene_name: str,
        active_source_id: object = None,
    ) -> dict[str, Any]:
        scene = await require_scene(repository, scene_name)
        normalized_source_id = str(active_source_id or "").strip() or None
        return self._assets.clear_director_world(
            project_dir,
            scene.name,
            active_source_id=normalized_source_id,
        )

    @staticmethod
    def _beat_context(
        *,
        episode_num: int | None,
        beat_num: int | None,
        beat: Mapping[str, Any] | None,
    ) -> dict[str, Any] | None:
        if episode_num is None or beat_num is None:
            return None
        beat = beat or {}
        visual_description = str(
            beat.get("visual_description")
            or beat.get("visual")
            or beat.get("description")
            or ""
        ).strip()
        context: dict[str, Any] = {
            "episode": int(episode_num),
            "beat": int(beat_num),
            "detected_identities": real_detected_identities(
                beat.get("detected_identities")
            ),
            "detected_props": real_detected_props(beat.get("detected_props")),
        }
        if visual_description:
            context["visual_description"] = visual_description
        return context

    @staticmethod
    def _pano_correction(state: SceneViewerAssetState) -> dict[str, Any]:
        raw = state.pano_correction
        sphere = raw.get("sphere_correction_deg")
        sphere = sphere if isinstance(sphere, Mapping) else {}
        return {
            "front_yaw_deg": float(raw.get("front_yaw_deg") or 0),
            "sphere_correction_deg": {
                "roll": float(sphere.get("roll") or 0),
                "pitch": float(sphere.get("pitch") or 0),
                "yaw": float(sphere.get("yaw") or 0),
            },
        }

    @staticmethod
    def _scene_world(
        state: SceneViewerAssetState,
        mode: ViewerMode,
    ) -> dict[str, Any]:
        if mode != "scene":
            return {
                "active_source_id": "",
                "scene": None,
                "scenes_by_source_id": {},
            }
        raw = state.scene_world
        scenes = raw.get("scenes_by_source_id")
        return {
            "active_source_id": str(raw.get("active_source_id") or ""),
            "scene": raw.get("scene") if isinstance(raw.get("scene"), dict) else None,
            "scenes_by_source_id": dict(scenes) if isinstance(scenes, Mapping) else {},
        }

    def _director_manifest_common(
        self,
        *,
        project_id: str,
        project_dir: Path,
        scene_name: str,
        mode: ViewerMode,
        episode_num: int | None,
        beat_num: int | None,
        beat_context: dict[str, Any] | None,
        palette: dict[str, Any],
        scene_world: Mapping[str, Any],
    ) -> dict[str, Any]:
        allowed = ["view", "download", "canvas_screenshot_node"]
        if mode == "beat":
            allowed = [
                "view",
                "download",
                "canvas_screenshot_node",
                "beat_director_combined",
                "beat_director_env_only",
                "beat_selected_background",
            ]
        manifest: dict[str, Any] = {
            "viewer_kind": "three_d_director",
            "mode": mode,
            "project": project_id,
            "scene_id": scene_name,
            "display_name": scene_name,
            "scenes_by_source_id": dict(scene_world["scenes_by_source_id"]),
            "source_orientation_mode": "supersplat_auto",
            "palette": palette,
            "allowed_destinations": allowed,
        }
        if scene_world["active_source_id"]:
            manifest["active_source_id"] = scene_world["active_source_id"]
        if scene_world["scene"] is not None:
            manifest["scene"] = scene_world["scene"]
        if mode == "beat" and episode_num is not None:
            manifest["blockings_dir_fs"] = (
                self._assets.director_blockings_filesystem_url(
                    project_dir,
                    int(episode_num),
                )
            )
            manifest["control_frames_dir_fs"] = (
                self._assets.director_control_frames_filesystem_url(project_dir)
            )
        if mode == "beat" and beat_num is not None:
            manifest["slate_beat"] = int(beat_num)
        if beat_context is not None:
            manifest["beat_context"] = beat_context
        return manifest

    def _director_source_options(
        self,
        *,
        state: SceneViewerAssetState,
        active_path: Path,
        asset_url: AssetUrl,
    ) -> list[dict[str, Any]]:
        options: list[dict[str, Any]] = []

        def add(
            kind: str,
            label: str,
            path: Path | None,
            current: bool = False,
        ) -> None:
            if path is None:
                return
            url = asset_url(path)
            if not url:
                return
            options.append(
                {
                    "kind": kind,
                    "label": label,
                    "source_type": "sog",
                    "ply_url": url,
                    "splat_url": url,
                    "splat_format": splat_format(path),
                    "fs": self._assets.filesystem_url(path),
                    "current": current or self._same_path(path, active_path),
                }
            )

        add("active", "active", active_path, True)
        for kind in ("master", "reverse", "pano", "uploaded", "custom"):
            if kind == "uploaded":
                if not state.manifest_source.startswith("uploaded_"):
                    continue
                path = state.splat_paths.get("custom")
            else:
                path = state.splat_paths.get(kind)
            add(kind, kind, path)

        pano_path = state.pano_path
        pano_url = asset_url(pano_path) if pano_path is not None else ""
        if pano_path is not None and pano_url:
            options.append(
                {
                    "kind": "pano",
                    "label": "360 图",
                    "source_type": "pano360",
                    "splat_format": "unknown",
                    "pano_url": pano_url,
                    "slot_kind": "scene_director_pano_360",
                    "fs": self._assets.filesystem_url(pano_path),
                    "current": False,
                }
            )
        return options

    @classmethod
    def _active_source_kind(
        cls,
        state: SceneViewerAssetState,
        active_path: Path,
    ) -> str:
        for kind, source_kind in (
            ("custom", "custom"),
            ("pano", "pano"),
            ("master", "master"),
            ("reverse", "reverse"),
        ):
            path = state.splat_paths.get(kind)
            if path is not None and cls._same_path(path, active_path):
                return source_kind
        return "uploaded" if state.manifest_source.startswith("uploaded_") else "custom"

    @staticmethod
    def _same_path(left: Path, right: Path) -> bool:
        return left.resolve() == right.resolve()

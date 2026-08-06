"""Local scene viewer assets and Director World persistence adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from ai_anime.modules.director_world.public import (
    blockings_dir,
    fs_url,
    stage_manifest,
)
from ai_anime.modules.asset_world.application.dto import SceneViewerAssetState
from ai_anime.utils.path_resolver import compute_scene_master_path


class LocalSceneViewerAssets:
    def has_master(self, project_dir: Path, scene_name: str) -> bool:
        return bool(compute_scene_master_path(project_dir, scene_name))

    def load(self, project_dir: Path, scene_name: str) -> SceneViewerAssetState:
        manifest = stage_manifest.load_manifest(project_dir, scene_name) or {}
        return SceneViewerAssetState(
            pano_path=stage_manifest.resolve_pano_path(project_dir, scene_name),
            active_splat_path=stage_manifest.resolve_ply_path(
                project_dir,
                scene_name,
            ),
            collision_path=stage_manifest.resolve_collision_glb_path(
                project_dir,
                scene_name,
            ),
            splat_paths={
                kind: stage_manifest.resolve_ply_path(
                    project_dir,
                    scene_name,
                    ply_kind=kind,
                )
                for kind in ("master", "reverse", "pano", "custom")
            },
            manifest_source=str(manifest.get("source") or ""),
            pano_correction=stage_manifest.get_pano_correction(
                project_dir,
                scene_name,
            ),
            scene_world=stage_manifest.get_scene_director_world(
                project_dir,
                scene_name,
            ),
        )

    def filesystem_url(self, path: Path) -> str:
        return fs_url(path)

    def director_blockings_filesystem_url(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> str:
        return fs_url(blockings_dir(project_dir, episode_num))

    def director_control_frames_filesystem_url(self, project_dir: Path) -> str:
        return fs_url(project_dir / "director_control_frames")

    def set_pano_correction(
        self,
        project_dir: Path,
        scene_name: str,
        correction: Mapping[str, Any],
    ) -> None:
        stage_manifest.set_pano_correction(
            project_dir,
            scene_name,
            dict(correction),
        )

    def save_director_world(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        active_source_id: str,
        snapshot: dict[str, Any],
        active_source: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return stage_manifest.save_scene_director_world(
            project_dir,
            scene_name,
            active_source_id=active_source_id,
            snapshot=snapshot,
            active_source=active_source,
        )

    def save_director_world_source(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        source_id: str,
        snapshot: dict[str, Any],
        source: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return stage_manifest.save_scene_director_world_source(
            project_dir,
            scene_name,
            source_id=source_id,
            snapshot=snapshot,
            source=source,
        )

    def clear_director_world(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        active_source_id: str | None,
    ) -> dict[str, Any]:
        return stage_manifest.clear_scene_director_world(
            project_dir,
            scene_name,
            active_source_id=active_source_id,
        )

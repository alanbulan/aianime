"""Local adapters for the scene catalog."""

from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.director_world import stage_manifest
from ai_anime.modules.asset_world.application.dto import CreateSceneCommand
from ai_anime.modules.asset_world.application.scene_models import (
    NovelScene,
    build_scene_effective_prompt,
)
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
)
from ai_anime.utils.path_resolver import (
    compute_scene_master_path,
    compute_scene_reverse_master_path,
)

AssetUrl = Callable[[str | Path], str]


class NovelSceneFactory:
    def create(self, command: CreateSceneCommand) -> NovelScene:
        return NovelScene(
            name=command.name,
            aliases=list(command.aliases),
            scene_type=command.scene_type,
            base_scene_id=command.base_scene_id,
            variant_id=command.variant_id,
            time_of_day=command.time_of_day,
            environment_prompt=command.environment_prompt,
            variant_prompt=command.variant_prompt,
            description=command.description,
            spatial_layout_image=command.spatial_layout_image,
            notes=command.notes,
        )


class LocalSceneCatalogAssets:
    def project(
        self,
        *,
        project_dir: Path,
        scene: Any,
        base_scene: Any | None,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        master_path = compute_scene_master_path(project_dir, scene.name)
        reverse_master_path = compute_scene_reverse_master_path(
            project_dir,
            scene.name,
        )
        pano_path = stage_manifest.resolve_pano_path(project_dir, scene.name)
        custom_scene_path = stage_manifest.resolve_ply_path(
            project_dir,
            scene.name,
            ply_kind="custom",
        )
        return {
            "effective_environment_prompt": build_scene_effective_prompt(
                scene,
                base_scene,
            ),
            "updated_at": newest_updated_at(
                getattr(scene, "updated_at", ""),
                tree_updated_at(project_dir / "assets" / "scenes" / scene.name),
                tree_updated_at(stage_manifest.stage_dir(project_dir, scene.name)),
            ),
            "master_path": master_path,
            "master_url": asset_url(master_path) if master_path else "",
            "reverse_master_path": reverse_master_path,
            "reverse_master_url": (
                asset_url(reverse_master_path) if reverse_master_path else ""
            ),
            "pano_path": str(pano_path) if pano_path is not None else "",
            "pano_url": asset_url(pano_path) if pano_path is not None else "",
            "custom_scene_path": (
                str(custom_scene_path) if custom_scene_path is not None else ""
            ),
            "custom_scene_url": (
                asset_url(custom_scene_path)
                if custom_scene_path is not None
                else ""
            ),
            "stage_3gs": self._stage_3gs_payload(
                project_dir=project_dir,
                scene_name=scene.name,
                asset_url=asset_url,
            ),
        }

    def rename_directories(
        self,
        project_dir: Path,
        old_name: str,
        new_name: str,
    ) -> None:
        self._move_dir_if_exists(
            project_dir / "assets" / "scenes" / old_name,
            project_dir / "assets" / "scenes" / new_name,
        )
        old_stage_root = stage_manifest.stage_dir(project_dir, old_name).parent
        new_stage_root = stage_manifest.stage_dir(project_dir, new_name).parent
        self._move_dir_if_exists(old_stage_root, new_stage_root)

        manifest = stage_manifest.load_manifest(project_dir, new_name)
        if manifest is not None:
            manifest["scene_id"] = new_name
            stage_manifest.save_manifest(project_dir, new_name, manifest)

    @classmethod
    def _stage_3gs_payload(
        cls,
        *,
        project_dir: Path,
        scene_name: str,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        stage_dir = stage_manifest.stage_dir(project_dir, scene_name)
        manifest = stage_manifest.load_manifest(project_dir, scene_name) or {}
        saved_world = stage_manifest.get_scene_director_world(project_dir, scene_name)
        saved_source_id = str(saved_world.get("active_source_id") or "").strip()
        saved_source = saved_world.get("active_source")
        saved_source = saved_source if isinstance(saved_source, dict) else {}
        kind_paths = {
            kind: stage_manifest.resolve_ply_path(
                project_dir,
                scene_name,
                ply_kind=kind,
            )
            for kind in ("custom", "master", "reverse", "pano")
        }
        active_path = stage_manifest.resolve_ply_path(project_dir, scene_name)
        active_source = ""
        if saved_source_id:
            saved_source_type = str(saved_source.get("source_type") or "").strip()
            saved_kind = str(
                saved_source.get("source_kind")
                or saved_source.get("kind")
                or saved_source.get("label")
                or saved_source_id
            ).lower()
            if (
                saved_source_type == "pano360"
                or "360" in saved_kind
                or "pano" in saved_kind
            ):
                active_path = stage_manifest.resolve_pano_path(project_dir, scene_name)
                active_source = "360"
            elif "master" in saved_kind:
                active_path = kind_paths.get("master")
                active_source = "master"
            elif "reverse" in saved_kind:
                active_path = kind_paths.get("reverse")
                active_source = "reverse"
            elif "custom" in saved_kind:
                active_path = kind_paths.get("custom")
                active_source = "custom"
        if active_path is not None and not active_source:
            for kind, label in (
                ("custom", "custom"),
                ("pano", "360"),
                ("master", "master"),
                ("reverse", "reverse"),
            ):
                kind_path = kind_paths.get(kind)
                if (
                    kind_path is not None
                    and kind_path.resolve() == active_path.resolve()
                ):
                    active_source = label
                    break

        try:
            stage_dir_display = stage_dir.relative_to(project_dir).as_posix()
        except ValueError:
            stage_dir_display = stage_dir.name

        return {
            "stage_dir": stage_dir_display,
            "manifest_ready": bool(manifest),
            "source": str(manifest.get("source") or ""),
            "active_source": active_source,
            "active": cls._stage_file_payload(
                project_dir=project_dir,
                path=active_path,
                asset_url=asset_url,
            ),
            "custom": cls._stage_file_payload(
                project_dir=project_dir,
                path=kind_paths["custom"],
                asset_url=asset_url,
            ),
            "master": cls._stage_file_payload(
                project_dir=project_dir,
                path=kind_paths["master"],
                asset_url=asset_url,
            ),
            "reverse": cls._stage_file_payload(
                project_dir=project_dir,
                path=kind_paths["reverse"],
                asset_url=asset_url,
            ),
            "pano": cls._stage_file_payload(
                project_dir=project_dir,
                path=kind_paths["pano"],
                asset_url=asset_url,
            ),
        }

    @staticmethod
    def _stage_file_payload(
        *,
        project_dir: Path,
        path: Path | None,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        if path is None:
            return {
                "ready": False,
                "path": "",
                "url": "",
                "size_bytes": 0,
                "size_mb": 0.0,
            }
        size_bytes = path.stat().st_size if path.exists() else 0
        try:
            display_path = path.relative_to(project_dir).as_posix()
        except ValueError:
            display_path = path.name
        return {
            "ready": path.exists(),
            "path": display_path,
            "url": asset_url(path),
            "size_bytes": size_bytes,
            "size_mb": round(size_bytes / (1024 * 1024), 1) if size_bytes else 0.0,
        }

    @staticmethod
    def _move_dir_if_exists(old_dir: Path, new_dir: Path) -> None:
        if not old_dir.exists():
            return
        if new_dir.exists():
            raise ValueError(f"Target asset directory already exists: {new_dir}")
        new_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_dir), str(new_dir))

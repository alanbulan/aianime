"""Local scene-source lookups used by generation tasks."""

from pathlib import Path

from ai_anime.modules.director_world.public import stage_manifest
from ai_anime.utils.path_resolver import (
    compute_scene_master_path,
    compute_scene_reverse_master_path,
)


class LocalSceneTaskAssets:
    def has_master(self, project_dir: Path, scene_name: str) -> bool:
        return bool(compute_scene_master_path(project_dir, scene_name))

    def has_reverse_master(self, project_dir: Path, scene_name: str) -> bool:
        return bool(compute_scene_reverse_master_path(project_dir, scene_name))

    def has_pano(self, project_dir: Path, scene_name: str) -> bool:
        return stage_manifest.resolve_pano_path(project_dir, scene_name) is not None

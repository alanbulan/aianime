"""Local scene-source and runtime capability lookups used by generation tasks."""

import importlib.util
import os

from pathlib import Path

from ai_anime.modules.asset_world.infrastructure.director_world import stage_manifest
from ai_anime.shared.utils.path_resolver import (
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

    def stage_generation_capability(self, step: str) -> tuple[bool, str]:
        world_runtime = os.environ.get("AI_ANIME_WORLD_RUNTIME_BIN", "").strip()
        if world_runtime and Path(world_runtime).is_file():
            return True, ""
        required = ["torch", "sharp", "plyfile"]
        if step == "pano_sharp":
            required.append("da2")
        missing = [name for name in required if importlib.util.find_spec(name) is None]
        if not missing:
            return True, ""
        label = "、".join(missing)
        return (
            False,
            "当前桌面安装包未包含本地 SHARP/3DGS 运行组件"
            f"（缺少：{label}），无法生成 SOG。"
            "场景图片、360 全景和导演世界仍可正常使用。",
        )

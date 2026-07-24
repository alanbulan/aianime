"""Scene master, panorama, and custom-package mutation use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.errors import InvalidSceneMediaInput
from ai_anime.modules.asset_world.application.ports import (
    SceneMediaFiles,
    SceneMediaRepository,
    SceneMediaUpload,
)
from ai_anime.modules.asset_world.application.scene_lookup import require_scene

CUSTOM_SCENE_PACKAGE_SUFFIXES = frozenset({".ply", ".sog", ".splat", ".ksplat"})


class SceneMediaUseCases:
    def __init__(self, files: SceneMediaFiles) -> None:
        self._files = files

    async def upload_master(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
        upload: SceneMediaUpload,
    ) -> Any:
        scene = await require_scene(repository, scene_name)
        self._files.save_master(
            project_dir,
            scene.name,
            await self._read_image(upload),
        )
        return scene

    async def delete_master(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
    ) -> dict[str, bool]:
        scene = await require_scene(repository, scene_name)
        return {"deleted": self._files.delete_master(project_dir, scene.name)}

    async def upload_pano(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
        upload: SceneMediaUpload,
    ) -> Any:
        scene = await require_scene(repository, scene_name)
        self._files.save_pano(
            project_dir,
            scene.name,
            await self._read_image(upload),
        )
        return scene

    async def delete_pano(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
    ) -> dict[str, bool]:
        scene = await require_scene(repository, scene_name)
        return {"deleted": self._files.delete_pano(project_dir, scene.name)}

    async def upload_custom_package(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
        upload: SceneMediaUpload,
    ) -> Any:
        scene = await require_scene(repository, scene_name)
        suffix = Path(str(upload.filename or "")).suffix.lower()
        if suffix not in CUSTOM_SCENE_PACKAGE_SUFFIXES:
            raise InvalidSceneMediaInput(
                "Custom scene package must be .ply, .sog, .splat, or .ksplat"
            )
        self._files.save_custom_package(
            project_dir,
            scene.name,
            suffix,
            upload.file,
        )
        return scene

    async def delete_custom_package(
        self,
        *,
        repository: SceneMediaRepository,
        project_dir: Path,
        scene_name: str,
    ) -> dict[str, bool]:
        scene = await require_scene(repository, scene_name)
        return {
            "deleted": self._files.delete_custom_package(project_dir, scene.name)
        }

    @staticmethod
    async def _read_image(upload: SceneMediaUpload) -> bytes:
        try:
            return await upload.read()
        except Exception as exc:
            raise InvalidSceneMediaInput(f"Invalid image file: {exc}") from exc

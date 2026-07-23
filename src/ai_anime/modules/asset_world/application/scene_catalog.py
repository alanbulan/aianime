"""Scene catalog application use cases."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    CreateSceneCommand,
    UpdateSceneCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidSceneInput,
    SceneAlreadyExists,
    SceneCatalogRejected,
    SceneNotFound,
)
from ai_anime.modules.asset_world.application.ports import (
    SceneCatalogAssets,
    SceneCatalogRepository,
    SceneFactory,
)
from ai_anime.modules.asset_world.domain.scene_catalog import (
    compose_scene_asset_name,
    derived_scene_names,
    scene_identity,
)

AssetUrl = Callable[[str | Path], str]


class SceneCatalogUseCases:
    def __init__(self, factory: SceneFactory, assets: SceneCatalogAssets) -> None:
        self._factory = factory
        self._assets = assets

    async def list_scenes(
        self,
        *,
        repository: SceneCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
    ) -> list[dict[str, Any]]:
        scenes = await repository.list_scenes()
        scenes_by_name = {
            scene.name: scene for scene in scenes if str(scene.name or "").strip()
        }
        return [
            self.project_scene(
                scene,
                project_dir=project_dir,
                asset_url=asset_url,
                derived_from_scene=str(
                    getattr(scene, "base_scene_id", "") or ""
                ).strip(),
                base_scene=scenes_by_name.get(
                    str(getattr(scene, "base_scene_id", "") or "")
                ),
            )
            for scene in scenes
        ]

    async def create_scene(
        self,
        *,
        repository: SceneCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
        command: CreateSceneCommand,
    ) -> dict[str, Any]:
        name = compose_scene_asset_name(
            command.name,
            command.base_scene_id,
            command.variant_id,
            command.time_of_day,
        )
        if not name:
            raise InvalidSceneInput("Scene name is required")
        if await repository.get_scene(name) is not None:
            raise SceneAlreadyExists(f"Scene '{name}' already exists")

        normalized = replace(
            command,
            name=name,
            base_scene_id=command.base_scene_id.strip(),
            variant_id=command.variant_id.strip(),
            time_of_day=command.time_of_day.strip(),
        )
        scene = self._factory.create(normalized)
        await repository.add_scene(scene)
        return self.project_scene(
            scene,
            project_dir=project_dir,
            asset_url=asset_url,
        )

    async def update_scene(
        self,
        *,
        repository: SceneCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
        scene_name: str,
        command: UpdateSceneCommand,
    ) -> dict[str, Any]:
        scene = await repository.get_scene(scene_name)
        if scene is None:
            raise SceneNotFound(f"Scene '{scene_name}' not found")

        updates = dict(command.fields)
        requested_name = str(updates.pop("name", "") or "").strip()
        next_base = str(
            updates.get("base_scene_id", getattr(scene, "base_scene_id", "")) or ""
        ).strip()
        next_variant = str(
            updates.get("variant_id", getattr(scene, "variant_id", "")) or ""
        ).strip()
        next_time = str(
            updates.get("time_of_day", getattr(scene, "time_of_day", "")) or ""
        ).strip()
        structured_name = compose_scene_asset_name(
            requested_name or scene.name,
            next_base,
            next_variant,
            next_time,
        )
        if next_base:
            requested_name = structured_name
        if requested_name and requested_name != scene.name:
            await self._reject_scene_with_derivatives(repository, scene.name)
            if await repository.get_scene(requested_name) is not None:
                raise SceneAlreadyExists(f"Scene '{requested_name}' already exists")
            try:
                self._assets.rename_directories(
                    project_dir,
                    scene.name,
                    requested_name,
                )
            except ValueError as exc:
                raise SceneCatalogRejected(str(exc)) from exc
            renamed = await repository.rename_scene(scene.name, requested_name)
            if not renamed:
                raise SceneCatalogRejected(f"Scene '{scene.name}' rename failed")
            scene = await repository.get_scene(requested_name) or scene

        if updates:
            await repository.update_scene(scene.name, **updates)
            scene = await repository.get_scene(scene.name) or scene

        return self.project_scene(
            scene,
            project_dir=project_dir,
            asset_url=asset_url,
        )

    async def delete_scene(
        self,
        *,
        repository: SceneCatalogRepository,
        scene_name: str,
    ) -> dict[str, bool]:
        scene = await repository.get_scene(scene_name)
        if scene is None:
            raise SceneNotFound(f"Scene '{scene_name}' not found")
        await self._reject_scene_with_derivatives(repository, scene.name)
        deleted = await repository.delete_scene(scene.name)
        return {"deleted": bool(deleted)}

    def project_scene(
        self,
        scene: Any,
        *,
        project_dir: Path,
        asset_url: AssetUrl,
        derived_from_scene: str = "",
        base_scene: Any | None = None,
    ) -> dict[str, Any]:
        base_scene_id, variant_id, time_of_day = scene_identity(
            scene,
            derived_from_scene,
        )
        return {
            "name": scene.name,
            "aliases": scene.aliases,
            "scene_type": scene.scene_type,
            "base_scene_id": base_scene_id,
            "variant_id": variant_id,
            "time_of_day": time_of_day,
            "environment_prompt": scene.environment_prompt,
            "variant_prompt": getattr(scene, "variant_prompt", ""),
            "description": scene.description,
            "derived_from_scene": derived_from_scene,
            "spatial_layout_image": scene.spatial_layout_image,
            "notes": scene.notes,
            **self._assets.project(
                project_dir=project_dir,
                scene=scene,
                base_scene=base_scene,
                asset_url=asset_url,
            ),
        }

    @staticmethod
    async def _reject_scene_with_derivatives(
        repository: SceneCatalogRepository,
        scene_name: str,
    ) -> None:
        names = derived_scene_names(await repository.list_scenes(), scene_name)
        if not names:
            return
        preview = "、".join(names[:5])
        suffix = "…" if len(names) > 5 else ""
        raise SceneCatalogRejected(
            f"场景「{scene_name}」存在派生场景：{preview}{suffix}；请先处理派生场景"
        )

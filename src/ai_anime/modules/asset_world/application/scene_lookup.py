"""Shared scene lookup rule for Asset & World application services."""

from __future__ import annotations

from typing import Any, Protocol

from ai_anime.modules.asset_world.application.errors import SceneNotFound


class SceneLookup(Protocol):
    async def get_scene(self, name: str) -> Any | None: ...


async def require_scene(repository: SceneLookup, scene_name: str) -> Any:
    scene = await repository.get_scene(scene_name)
    if scene is None:
        raise SceneNotFound(f"Scene '{scene_name}' not found")
    return scene

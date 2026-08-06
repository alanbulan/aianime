"""Adapters for sketch marker color assignment."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.public import runtime_prop_menu_for_episode
from ai_anime.modules.production.domain.sketch_color import (
    assign_identity_sketch_colors,
)
from ai_anime.shared.utils.path_resolver import PathResolver


class DomainSketchColorAssigner:
    def assign(
        self,
        characters: list[dict[str, Any]],
        beats: list[dict[str, Any]],
        *,
        existing_colors: dict[str, str] | None = None,
    ) -> dict[str, str]:
        return assign_identity_sketch_colors(
            characters,
            episode_beats=beats,
            existing_colors=existing_colors,
        )


class AssetWorldRuntimePropMenuSource:
    async def for_episode(
        self,
        store: Any,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return await runtime_prop_menu_for_episode(store, episode, beats)


class LocalProductionSketchWorkspace:
    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None:
        PathResolver(str(output_dir), episode_num).clean_sketches()

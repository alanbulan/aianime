"""Sketch marker color assignment application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSource,
    ProductionRuntimePropMenuSource,
    ProductionSketchColorAssigner,
    ProductionSketchColorStore,
    ProductionSketchWorkspace,
)
from ai_anime.modules.production.domain.sketch_color import (
    apply_prop_marker_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)


@dataclass(frozen=True)
class SketchColorAssignmentResult:
    identity_colors: dict[str, str]
    prop_colors: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "colors": self.identity_colors,
            "count": len(self.identity_colors),
            "prop_colors": self.prop_colors,
            "prop_count": len(self.prop_colors),
        }


class SketchColorMarkersMissing(Exception):
    pass


class SketchColorAssignmentUseCases:
    def __init__(
        self,
        color_assigner: ProductionSketchColorAssigner,
        episodes: ProductionEpisodeSource,
        prop_menus: ProductionRuntimePropMenuSource,
        workspace: ProductionSketchWorkspace,
    ) -> None:
        self._color_assigner = color_assigner
        self._episodes = episodes
        self._prop_menus = prop_menus
        self._workspace = workspace

    async def assign(
        self,
        *,
        store: ProductionSketchColorStore,
        episode_num: int,
        beats: list[dict[str, Any]],
        output_dir: str | Path,
    ) -> SketchColorAssignmentResult:
        previous_colors = dict(store.get_sketch_colors(episode_num) or {})
        identity_colors = self._color_assigner.assign(
            [],
            beats,
            existing_colors=previous_colors,
        )

        episode = self._episodes.episode_or_none(store, episode_num)
        prop_menu = await self._prop_menus.for_episode(
            store,
            episode,
            beats,
        )
        previous_prop_colors = global_prop_marker_colors(
            beats,
            prop_menu=prop_menu,
            sketch_colors=previous_colors,
        )
        prop_colors = global_prop_marker_colors(
            beats,
            prop_menu=prop_menu,
            sketch_colors=identity_colors,
            assign_missing=True,
        )
        if not identity_colors and not prop_colors:
            raise SketchColorMarkersMissing

        try:
            if identity_colors:
                await store.set_sketch_colors(episode_num, identity_colors)
            if prop_colors and prop_menu:
                await store.update_episode(
                    episode_num,
                    prop_menu=apply_prop_marker_colors(prop_menu, prop_colors),
                )
        except Exception:
            pass

        previous_markers = {
            **{
                f"identity:{key}": value
                for key, value in previous_colors.items()
            },
            **{f"prop:{key}": value for key, value in previous_prop_colors.items()},
        }
        current_markers = {
            **{f"identity:{key}": value for key, value in identity_colors.items()},
            **{f"prop:{key}": value for key, value in prop_colors.items()},
        }
        if marker_color_change_requires_sketch_clean(
            previous_markers,
            current_markers,
        ):
            self._workspace.clear_episode_sketches(output_dir, episode_num)

        return SketchColorAssignmentResult(
            identity_colors=identity_colors,
            prop_colors=prop_colors,
        )

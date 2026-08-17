"""Generation context application use cases."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionCharacterProjector,
    ProductionEpisodeSource,
    ProductionGenerationStore,
    ProductionSketchColorAssigner,
)
from ai_anime.modules.production.application.sketch_color import (
    assign_complete_episode_identity_colors,
)


class ProductionGenerationContextUseCases:
    def __init__(
        self,
        store: ProductionGenerationStore,
        episodes: ProductionEpisodeSource,
        color_assigner: ProductionSketchColorAssigner,
        character_projector: ProductionCharacterProjector,
    ) -> None:
        self._store = store
        self._episodes = episodes
        self._color_assigner = color_assigner
        self._character_projector = character_projector

    def episode_or_none(self, episode_num: int) -> Any | None:
        return self._episodes.episode_or_none(self._store, episode_num)

    async def build_character_map(
        self,
        *,
        beats: list[dict[str, Any]],
        project: str,
        episode_num: int | None = None,
        use_detected_identities: bool = False,
    ) -> dict[str, dict[str, Any]]:
        characters = self._character_projector.project_characters(
            self._store.get_all_characters(),
            project,
        )

        sketch_colors = None
        if episode_num:
            sketch_colors = self._store.get_sketch_colors(episode_num) or None
            complete_colors = assign_complete_episode_identity_colors(
                self._color_assigner,
                characters=characters,
                beats=beats,
                episode=self.episode_or_none(episode_num),
                existing_colors=sketch_colors,
            )
            if complete_colors != (sketch_colors or {}):
                await self._store.set_sketch_colors(episode_num, complete_colors)
            sketch_colors = complete_colors or None

        return self._character_projector.build_character_map(
            beats=beats,
            characters=characters,
            project=project,
            sketch_colors=sketch_colors,
            use_detected_identities=use_detected_identities,
        )

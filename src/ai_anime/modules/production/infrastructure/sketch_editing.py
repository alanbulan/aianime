"""Local workspace adapter for project-facing sketch editing."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ai_anime.modules.production.application.sketch_editing import (
    CanonicalSketch,
    SketchBeatContext,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores


class LocalProductionSketchEditingWorkspace:
    def __init__(
        self,
        media_url_builder: Callable[..., str] = project_media.make_project_static_url,
    ) -> None:
        self._media_url_builder = media_url_builder

    def canonical_sketch(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> CanonicalSketch | None:
        relative_path = f"sketches/ep{episode_num:03d}/beat_{beat_num:02d}.png"
        sketch_path = Path(context.output_dir) / relative_path
        if not sketch_path.exists():
            return None
        return CanonicalSketch(
            path=sketch_path,
            url=self._media_url_builder(
                context,
                relative_path,
                local_path=sketch_path,
            ),
        )

    async def beat_context(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> SketchBeatContext | None:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            beats = await store.get_beats_as_dicts(episode_num)
            beat = next(
                (
                    candidate
                    for candidate in beats
                    if int(candidate.get("beat_number", 0) or 0) == beat_num
                ),
                None,
            )
            if beat is None:
                return None
            return SketchBeatContext(
                beat=beat,
                sketch_colors=dict(store.get_sketch_colors(episode_num) or {}),
            )
        finally:
            await store.close()


__all__ = ["LocalProductionSketchEditingWorkspace"]

"""Creative Canvas adapters for mainline image generation."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, Mapping

from PIL import Image

from ai_anime.modules.asset_world.public import runtime_prop_menu_for_episode
from ai_anime.modules.creative_canvas.application.mainline_generation import (
    CreativeCanvasMainlineBeatMissing,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    list_text_values,
    normalize_mainline_frame_quality,
    standalone_character_map,
    standalone_prop_marker_colors,
    standalone_sketch_colors,
)
from ai_anime.modules.creative_canvas.infrastructure.image_models import (
    resolve_configured_image_model,
)
from ai_anime.modules.creative_canvas.infrastructure.paths import outputs_dir
from ai_anime.modules.production.public import (
    production_generation_context_use_cases,
    production_image_settings_use_cases,
)
from ai_anime.modules.project_workspace.public import ProjectContext, load_project_config
from ai_anime.shared.infrastructure.project_stores import make_sqlite_store_for_context


class LocalCreativeCanvasMainlineGenerationConfigSource:
    def __init__(
        self,
        store_factory: Callable[[ProjectContext], Awaitable[Any]] = (
            make_sqlite_store_for_context
        ),
    ) -> None:
        self._store_factory = store_factory

    async def load_beat(
        self,
        context: ProjectContext,
        episode: int,
        beat: int,
    ) -> dict[str, Any]:
        store = await self._store_factory(context)
        beats = await store.get_beats_as_dicts(int(episode))
        for row in beats:
            if int(row.get("beat_number") or 0) == int(beat):
                return row
        raise CreativeCanvasMainlineBeatMissing(
            f"beat not found: ep={episode} beat={beat}"
        )

    async def single_beat_config(
        self,
        context: ProjectContext,
        *,
        episode: int,
        beat: int,
        mode_key: str,
        aspect_ratio: str,
        is_sketch: bool,
    ) -> dict[str, Any]:
        store = await self._store_factory(context)
        generation_context = production_generation_context_use_cases(
            store,
            context.owner_username,
        )
        beats = await store.get_beats_as_dicts(int(episode))
        if not beats:
            raise CreativeCanvasMainlineBeatMissing(
                f"No beats found for episode {episode}"
            )
        selected_beat = self._beat_by_number(beats, int(beat))
        loaded_project_config = load_project_config(
            context.owner_username,
            context.project_name,
        )
        image_settings = production_image_settings_use_cases()
        episode_obj = generation_context.episode_or_none(int(episode))
        prop_menu = await runtime_prop_menu_for_episode(store, episode_obj, beats)
        sketch_colors = (
            store.get_sketch_colors(int(episode)) or {}
            if hasattr(store, "get_sketch_colors")
            else {}
        )
        if is_sketch:
            character_map = (
                await generation_context.build_character_map(
                    beats=beats,
                    project=context.project_name,
                    episode_num=int(episode),
                    use_detected_identities=False,
                )
                if hasattr(store, "get_all_characters")
                else {}
            )
            return {
                "beats": beats,
                "character_map": character_map,
                "style": loaded_project_config.get(
                    "visual_style", "chinese_period_drama"
                ),
                "ethnicity": loaded_project_config.get("ethnicity", "Chinese"),
                "sketch_colors": sketch_colors,
                "prop_menu": prop_menu,
                "direct_sketch_beats": True,
                "beat_numbers": [int(beat)],
                "mode_key": mode_key,
                "aspect_ratio": aspect_ratio,
            }

        character_map = (
            await generation_context.build_character_map(
                beats=[selected_beat],
                project=context.project_name,
                episode_num=int(episode),
                use_detected_identities=True,
            )
            if hasattr(store, "get_all_characters")
            else {}
        )
        return {
            "beats": beats,
            "character_map": character_map,
            "style": loaded_project_config.get(
                "visual_style", "chinese_period_drama"
            ),
            "ethnicity": loaded_project_config.get("ethnicity", "Chinese"),
            "selected_beat_numbers": [int(beat)],
            "sketch_colors": sketch_colors,
            "prop_menu": prop_menu,
            "sketch_aspect_padding": image_settings.resolve_sketch_aspect_padding(
                loaded_project_config,
                None,
            ),
            "mode_key": mode_key,
            "aspect_ratio": aspect_ratio,
        }

    def standalone_frame_config(
        self,
        context: ProjectContext,
        *,
        beat_payload: Mapping[str, Any] | None,
        beat_context: Mapping[str, Any],
        mode_key: str,
        aspect_ratio: str,
        quality: str,
    ) -> dict[str, Any]:
        loaded_project_config = load_project_config(
            context.owner_username,
            context.project_name,
        )
        image_settings = production_image_settings_use_cases()
        beat = dict(beat_payload or {})
        if beat:
            beat["episode_number"] = 0
            beat["beat_number"] = 0
            beat["panel_index"] = 0
        return {
            "standalone_beat_context": True,
            "beats": [beat] if beat else [],
            "character_map": standalone_character_map(beat_context),
            "style": loaded_project_config.get(
                "visual_style", "chinese_period_drama"
            ),
            "ethnicity": loaded_project_config.get("ethnicity", "Chinese"),
            "selected_panel_indices": [0],
            "sketch_colors": standalone_sketch_colors(beat_context),
            "prop_marker_colors": standalone_prop_marker_colors(beat_context),
            "prop_menu": [
                {"prop_id": prop_id, "name": prop_id}
                for prop_id in list_text_values(beat_context.get("detected_props"))
            ],
            "sketch_aspect_padding": image_settings.resolve_sketch_aspect_padding(
                loaded_project_config,
                None,
            ),
            "mode_key": mode_key,
            "aspect_ratio": aspect_ratio,
            "promote_selected_regen": False,
            "image_quality": normalize_mainline_frame_quality(quality),
        }

    @staticmethod
    def _beat_by_number(beats: list[dict], beat_number: int) -> dict:
        for beat in beats:
            try:
                if int(beat.get("beat_number") or 0) == int(beat_number):
                    return beat
            except (TypeError, ValueError):
                continue
        raise CreativeCanvasMainlineBeatMissing(f"beat not found: {beat_number}")


class PillowCreativeCanvasImageAspectReader:
    def read_aspect_ratio(self, path: Path) -> str:
        try:
            with Image.open(path) as image:
                width, height = image.size
        except Exception:
            return "2:3"
        if width <= 0 or height <= 0:
            return "2:3"
        ratio = width / height
        portrait_delta = abs(ratio - (2 / 3))
        landscape_delta = abs(ratio - (16 / 9))
        return "16:9" if landscape_delta < portrait_delta else "2:3"


class LocalCreativeCanvasScene360Runtime:
    def artifact_dir(self, project_dir: Path, job_id: str) -> Path:
        return outputs_dir(project_dir, "mainline_scene_360") / job_id

    def resolve_model(self, model: str) -> str:
        return resolve_configured_image_model(model)

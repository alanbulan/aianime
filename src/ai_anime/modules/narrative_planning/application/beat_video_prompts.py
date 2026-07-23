from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from ai_anime.models import sync_beat_asset_refs
from ai_anime.modules.narrative_planning.application.ports import (
    FirstFramePromptGenerator,
    KeyframePromptGenerator,
    NarrativeScriptStore,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatVideoPromptSelection,
    select_beat_video_prompt_target,
)


@dataclass(frozen=True)
class GeneratedBeatVideoPrompt:
    beat: dict[str, Any]
    field: str
    prompt: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat": self.beat,
            "field": self.field,
            "prompt": self.prompt,
        }


class BeatVideoPrompts:
    def __init__(
        self,
        *,
        first_frame_generator: FirstFramePromptGenerator,
        keyframe_generator: KeyframePromptGenerator,
    ) -> None:
        self._first_frame_generator = first_frame_generator
        self._keyframe_generator = keyframe_generator

    async def resolve_target(
        self,
        store: NarrativeScriptStore,
        *,
        episode_num: int,
        beat_num: int,
    ) -> BeatVideoPromptSelection:
        script = await store.get_script_as_dict(episode_num)
        return select_beat_video_prompt_target(script, beat_num)

    async def generate_and_save(
        self,
        store: NarrativeScriptStore,
        *,
        output_dir: str | Path,
        project_name: str,
        episode_num: int,
        beat_num: int,
        language: str,
    ) -> GeneratedBeatVideoPrompt:
        selection = await self.resolve_target(
            store,
            episode_num=episode_num,
            beat_num=beat_num,
        )
        if selection.field == "keyframe_prompt":
            prompt = await self._keyframe_generator(
                output_dir=output_dir,
                episode=episode_num,
                beat=selection.beat,
                next_beat=cast(dict[str, Any], selection.next_beat),
                language=language,
            )
        else:
            prompt = await self._first_frame_generator(
                store=store,
                output_dir=output_dir,
                project_name=project_name,
                episode=episode_num,
                beat=selection.beat,
                all_beats=list(selection.beats),
                previous_beat=selection.previous_beat,
                next_beat=selection.next_beat,
                language=language,
            )

        selection.beat[selection.field] = prompt
        sync_beat_asset_refs(selection.beat)
        saved = await store.update_beat_asset(
            episode_number=episode_num,
            beat_number=beat_num,
            **{selection.field: prompt},
        )
        if not saved:
            raise RuntimeError(f"Beat {beat_num} was not updated")

        return GeneratedBeatVideoPrompt(
            beat=selection.beat,
            field=selection.field,
            prompt=prompt,
        )

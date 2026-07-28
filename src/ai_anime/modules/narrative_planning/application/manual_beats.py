from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.public import (
    extract_char_identities_from_markers,
    extract_prop_ids_from_markers,
)
from ai_anime.modules.narrative_planning.application.beat_models import NovelVisualBeat
from ai_anime.modules.narrative_planning.application.ports import (
    ManualBeatAssetWorkspace,
    ManualBeatStore,
)
from ai_anime.modules.narrative_planning.domain import (
    DEFAULT_MANUAL_DURATION,
    beat_order_value,
    calculate_insert_order,
    is_manual_shot,
    normalize_manual_beat_audio,
    normalize_shot_orders,
    sort_beats_for_display,
)


@dataclass(frozen=True)
class InsertManualBeatCommand:
    episode_number: int
    after_beat_number: int | None
    visual_description: str
    duration_seconds: float | None = None
    scene_ref: dict[str, Any] | None = None
    time_of_day: str | None = None
    detected_identities: Sequence[str] | None = None
    detected_props: Sequence[str] | None = None
    audio_type: str | None = "silence"
    speaker: str | None = None
    narration_segment: str | None = None


class ManualBeatService:
    def __init__(self, asset_workspace: ManualBeatAssetWorkspace) -> None:
        self._asset_workspace = asset_workspace

    async def _normalize_episode_orders(
        self,
        store: ManualBeatStore,
        episode_number: int,
        beats: Sequence[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        for beat_num, shot_order in normalize_shot_orders(beats):
            await store.update_beat_asset(
                episode_number,
                beat_num,
                shot_order=shot_order,
            )
        refreshed = await store.get_beats_as_dicts(episode_number)
        return sort_beats_for_display(refreshed)

    def _next_beat_number(
        self,
        beats: Sequence[dict[str, Any]],
        episode_number: int,
    ) -> int:
        used_numbers = {
            int(beat.get("beat_number", 0) or 0)
            for beat in beats
            if int(beat.get("beat_number", 0) or 0) > 0
        }
        used_numbers.update(self._asset_workspace.existing_beat_numbers(episode_number))
        return (max(used_numbers) if used_numbers else 0) + 1

    async def insert(
        self,
        store: ManualBeatStore,
        command: InsertManualBeatCommand,
    ) -> dict[str, Any]:
        episode_number = command.episode_number
        beats = sort_beats_for_display(await store.get_beats_as_dicts(episode_number))
        if not beats:
            raise ValueError(f"Episode {episode_number} has no beats")

        if command.after_beat_number is None:
            previous_beat = None
            next_beat = beats[0]
        else:
            insert_index = next(
                (
                    index
                    for index, beat in enumerate(beats)
                    if beat.get("beat_number") == command.after_beat_number
                ),
                None,
            )
            if insert_index is None:
                raise ValueError(
                    f"Beat {command.after_beat_number} not found in episode "
                    f"{episode_number}"
                )
            previous_beat = beats[insert_index]
            next_beat = (
                beats[insert_index + 1] if insert_index + 1 < len(beats) else None
            )

        new_order = calculate_insert_order(
            beat_order_value(previous_beat) if previous_beat else None,
            beat_order_value(next_beat) if next_beat else None,
        )
        if new_order is None:
            beats = await self._normalize_episode_orders(
                store,
                episode_number,
                beats,
            )
            if command.after_beat_number is None:
                previous_beat = None
                next_beat = beats[0]
            else:
                insert_index = next(
                    index
                    for index, beat in enumerate(beats)
                    if beat.get("beat_number") == command.after_beat_number
                )
                previous_beat = beats[insert_index]
                next_beat = (
                    beats[insert_index + 1] if insert_index + 1 < len(beats) else None
                )
            new_order = calculate_insert_order(
                beat_order_value(previous_beat) if previous_beat else None,
                beat_order_value(next_beat) if next_beat else None,
            )
            if new_order is None:
                raise ValueError("Unable to allocate shot_order after normalization")

        source = previous_beat or next_beat or {}
        saved_identities = (
            list(command.detected_identities)
            if command.detected_identities is not None
            else list(
                extract_char_identities_from_markers(
                    command.visual_description,
                    strict=False,
                ).values()
            )
        )
        saved_props = (
            list(command.detected_props)
            if command.detected_props is not None
            else extract_prop_ids_from_markers(
                command.visual_description,
                strict=False,
            )
        )
        inherited_scene_ref = (
            command.scene_ref
            if command.scene_ref is not None
            else source.get("scene_ref")
        )
        scene_ref_json = (
            json.dumps(inherited_scene_ref, ensure_ascii=False)
            if isinstance(inherited_scene_ref, dict) and inherited_scene_ref
            else ""
        )
        audio = normalize_manual_beat_audio(
            audio_type=command.audio_type,
            speaker=command.speaker,
            narration=command.narration_segment,
        )
        new_beat = NovelVisualBeat(
            episode_number=episode_number,
            beat_number=self._next_beat_number(beats, episode_number),
            shot_order=new_order,
            duration_seconds=command.duration_seconds or DEFAULT_MANUAL_DURATION,
            is_manual_shot=True,
            narration=audio.narration,
            visual_description=command.visual_description,
            video_prompt="",
            keyframe_prompt="",
            video_mode="first_frame",
            scene_ref_json=scene_ref_json,
            time_of_day=(
                source.get("time_of_day", "")
                if command.time_of_day is None
                else command.time_of_day
            ),
            detected_identities_json=json.dumps(saved_identities, ensure_ascii=False),
            detected_props_json=json.dumps(saved_props, ensure_ascii=False),
            audio_type=audio.audio_type,
            speaker=audio.speaker,
        )
        await store.add_visual_beats([new_beat])

        refreshed = await store.get_beats_as_dicts(episode_number)
        return next(
            beat
            for beat in refreshed
            if int(beat.get("beat_number", 0)) == new_beat.beat_number
        )

    async def delete(
        self,
        store: ManualBeatStore,
        *,
        episode_number: int,
        beat_number: int,
    ) -> list[dict[str, Any]]:
        beats = sort_beats_for_display(await store.get_beats_as_dicts(episode_number))
        target = next(
            (
                beat
                for beat in beats
                if int(beat.get("beat_number", 0) or 0) == int(beat_number)
            ),
            None,
        )
        if target is None:
            raise ValueError(
                f"Beat {beat_number} not found in episode {episode_number}"
            )
        if not is_manual_shot(target):
            raise ValueError("Only manual shots can be deleted")

        deleted = await store.delete_manual_beat(episode_number, int(beat_number))
        if not deleted:
            raise ValueError(f"Manual shot {beat_number} was not deleted")
        self._asset_workspace.delete_beat_artifacts(
            episode_number,
            beat_number,
        )
        return sort_beats_for_display(await store.get_beats_as_dicts(episode_number))


__all__ = ["InsertManualBeatCommand", "ManualBeatService"]

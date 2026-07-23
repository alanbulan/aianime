from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from ai_anime.models import sync_beat_asset_refs
from ai_anime.modules.narrative_planning.application.ports import (
    ScriptDocumentStore,
)
from ai_anime.modules.narrative_planning.domain import (
    BeatNotFound,
    ScriptNotFound,
)


PERSISTED_BEAT_UPDATE_FIELDS = frozenset(
    {
        "audio_type",
        "detected_identities",
        "detected_props",
        "keyframe_prompt",
        "narration_segment",
        "scene_ref",
        "seedance2_config_json",
        "speaker",
        "time_of_day",
        "video_mode",
        "video_prompt",
        "visual_description",
    }
)


class BeatStoreUpdateFailed(RuntimeError):
    pass


class ScriptStoreSyncFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class SavedEpisodeScript:
    episode: int
    beats_count: int

    def as_dict(self) -> dict[str, int]:
        return {
            "episode": self.episode,
            "beats_count": self.beats_count,
        }


class ScriptDocumentService:
    async def load(
        self,
        store: ScriptDocumentStore,
        episode_num: int,
    ) -> dict[str, Any] | None:
        return await store.get_script_as_dict(episode_num)

    async def update_beat(
        self,
        store: ScriptDocumentStore,
        *,
        episode_num: int,
        beat_num: int,
        updates: Mapping[str, Any],
    ) -> dict[str, Any]:
        script = await store.get_script_as_dict(episode_num)
        if not script:
            raise ScriptNotFound("Script not found")

        target = next(
            (
                beat
                for beat in script.get("beats") or []
                if int(beat.get("beat_number") or 0) == beat_num
            ),
            None,
        )
        if target is None:
            raise BeatNotFound(f"Beat {beat_num} not found")

        target.update(updates)
        sync_beat_asset_refs(target)
        persisted_updates = {
            key: value
            for key, value in updates.items()
            if key in PERSISTED_BEAT_UPDATE_FIELDS
        }
        try:
            saved = await store.update_beat_asset(
                episode_number=episode_num,
                beat_number=beat_num,
                **persisted_updates,
            )
            if not saved:
                raise RuntimeError(f"Beat {beat_num} was not updated")
        except Exception as exc:
            raise BeatStoreUpdateFailed(str(exc)) from exc

        return target

    async def save(
        self,
        store: ScriptDocumentStore,
        *,
        episode_num: int,
        beats: list[dict[str, Any]],
    ) -> SavedEpisodeScript:
        await store.load_graph_state()
        normalized_beats: list[dict[str, Any]] = []
        for beat in beats:
            payload = dict(beat)
            sync_beat_asset_refs(payload)
            normalized_beats.append(payload)

        try:
            await store.persist_beats_from_script(episode_num, normalized_beats)
        except Exception as exc:
            raise ScriptStoreSyncFailed(str(exc)) from exc

        return SavedEpisodeScript(
            episode=episode_num,
            beats_count=len(beats),
        )

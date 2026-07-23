from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.ports import (
    AudioDurationProbe,
    EpisodeBeatMediaCatalog,
    EpisodeBeatStore,
    ProjectMediaUrlBuilder,
)


_MEDIA_KINDS = ("sketch", "frame", "video", "audio")


class EpisodeBeatMediaProjection:
    def __init__(
        self,
        *,
        media_catalog: EpisodeBeatMediaCatalog,
        url_builder: ProjectMediaUrlBuilder,
        audio_duration_probe: AudioDurationProbe,
    ) -> None:
        self._media_catalog = media_catalog
        self._url_builder = url_builder
        self._audio_duration_probe = audio_duration_probe

    async def list(
        self,
        store: EpisodeBeatStore,
        episode_number: int,
    ) -> list[dict[str, Any]]:
        beats = await store.get_beats_as_dicts(episode_number)
        audio_duration_jobs: list[tuple[dict[str, Any], Path]] = []

        for beat in beats:
            beat["audio_duration_seconds"] = None
            for media_kind in _MEDIA_KINDS:
                beat[f"{media_kind}_url"] = ""

            beat_number = int(beat.get("beat_number", 0) or 0)
            if beat_number <= 0:
                continue

            resources = self._media_catalog.locate(
                episode_number,
                beat_number,
            )
            for media_kind in _MEDIA_KINDS:
                resource = resources.get(media_kind)
                if resource is not None:
                    beat[f"{media_kind}_url"] = self._url_builder.build(resource)

            audio_resource = resources.get("audio")
            if audio_resource is not None:
                audio_duration_jobs.append((beat, audio_resource.local_path))

        durations = await asyncio.gather(
            *(
                self._audio_duration_probe.read(path)
                for _, path in audio_duration_jobs
            ),
            return_exceptions=True,
        )
        for (beat, _), value in zip(audio_duration_jobs, durations):
            if isinstance(value, (int, float)) and value > 0:
                beat["audio_duration_seconds"] = float(value)

        return beats


__all__ = ["EpisodeBeatMediaProjection"]

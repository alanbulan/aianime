from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from ai_anime.modules.narrative_planning.application.beat_media import (
    EpisodeBeatMediaProjection,
)
from ai_anime.modules.narrative_planning.application.ports import (
    ProjectMediaResource,
)
from ai_anime.modules.narrative_planning.infrastructure.beat_media import (
    LocalEpisodeBeatMediaCatalog,
)


class _BeatStore:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats

    async def get_beats_as_dicts(self, episode_number: int) -> list[dict]:
        assert episode_number == 2
        return self.beats


class _MediaCatalog:
    def __init__(self, resources: dict[int, dict[str, ProjectMediaResource]]) -> None:
        self.resources = resources
        self.calls: list[tuple[int, int]] = []

    def locate(
        self,
        episode_number: int,
        beat_number: int,
    ) -> dict[str, ProjectMediaResource]:
        self.calls.append((episode_number, beat_number))
        return self.resources.get(beat_number, {})


class _UrlBuilder:
    def build(self, resource: ProjectMediaResource) -> str:
        return f"/media/{resource.relative_path}"


class _ConcurrentDurationProbe:
    def __init__(self) -> None:
        self.started = 0
        self.all_started = asyncio.Event()

    async def read(self, audio_path: Path) -> float:
        self.started += 1
        if self.started == 2:
            self.all_started.set()
        await asyncio.wait_for(self.all_started.wait(), timeout=0.5)
        if audio_path.name == "beat_42.mp3":
            raise RuntimeError("unreadable audio")
        return 3.25


@pytest.mark.asyncio
async def test_beat_media_projection_uses_sparse_numbers_and_concurrent_duration_probes(
    tmp_path,
):
    def resource(relative_path: str) -> ProjectMediaResource:
        return ProjectMediaResource(
            relative_path=relative_path,
            local_path=tmp_path / Path(relative_path),
        )

    catalog = _MediaCatalog(
        {
            7: {
                "sketch": resource("sketches/ep002/beat_07.png"),
                "audio": resource("audio/ep002/beat_07.mp3"),
            },
            42: {
                "video": resource("videos/beats/ep002/beat_42.mp4"),
                "audio": resource("audio/ep002/beat_42.mp3"),
            },
        }
    )
    projection = EpisodeBeatMediaProjection(
        media_catalog=catalog,
        url_builder=_UrlBuilder(),
        audio_duration_probe=_ConcurrentDurationProbe(),
    )

    beats = await asyncio.wait_for(
        projection.list(
            _BeatStore(
                [
                    {"beat_number": 7},
                    {"beat_number": 42},
                    {"beat_number": 0},
                ]
            ),
            2,
        ),
        timeout=1,
    )

    assert catalog.calls == [(2, 7), (2, 42)]
    assert beats[0]["sketch_url"] == "/media/sketches/ep002/beat_07.png"
    assert beats[0]["frame_url"] == ""
    assert beats[0]["audio_duration_seconds"] == 3.25
    assert beats[1]["video_url"] == "/media/videos/beats/ep002/beat_42.mp4"
    assert beats[1]["audio_duration_seconds"] is None
    assert beats[2] == {
        "beat_number": 0,
        "audio_duration_seconds": None,
        "sketch_url": "",
        "frame_url": "",
        "video_url": "",
        "audio_url": "",
    }


def test_local_beat_media_catalog_uses_episode_and_sparse_beat_file_names(tmp_path):
    sketch = tmp_path / "sketches" / "ep012" / "beat_41.png"
    video = tmp_path / "videos" / "beats" / "ep012" / "beat_41.mp4"
    sketch.parent.mkdir(parents=True)
    video.parent.mkdir(parents=True)
    sketch.write_bytes(b"sketch")
    video.write_bytes(b"video")

    resources = LocalEpisodeBeatMediaCatalog(tmp_path).locate(12, 41)

    assert set(resources) == {"sketch", "video"}
    assert resources["sketch"].relative_path == "sketches/ep012/beat_41.png"
    assert resources["video"].relative_path == "videos/beats/ep012/beat_41.mp4"
    assert resources["sketch"].local_path == sketch
    assert resources["video"].local_path == video

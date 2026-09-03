from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure import episode_composition


@pytest.mark.asyncio
async def test_episode_bgm_generation_is_cached_by_content_and_duration(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[dict] = []

    async def write_music(**kwargs):
        calls.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"music")

    monkeypatch.setattr(episode_composition, "write_model_audio_music", write_music)
    beats = [
        {
            "beat_number": 1,
            "narration_segment": "他推开门。",
            "visual_description": "雨夜中的旧屋。",
        }
    ]

    first = await episode_composition.generate_episode_bgm(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        duration_seconds=900,
    )
    second = await episode_composition.generate_episode_bgm(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        duration_seconds=900,
    )

    assert first == second
    assert first.read_bytes() == b"music"
    assert len(calls) == 1
    assert calls[0]["duration_seconds"] == 600.0
    assert calls[0]["parameters"]["force_instrumental"] is True
    assert "No vocals" in calls[0]["prompt"]


def test_composition_manifest_invalidates_when_an_option_changes(tmp_path: Path) -> None:
    video = tmp_path / "videos" / "beats" / "ep001" / "beat_01.mp4"
    video.parent.mkdir(parents=True)
    video.write_bytes(b"source")
    bgm = episode_composition.episode_bgm_path(tmp_path, 1)
    bgm.parent.mkdir(parents=True)
    bgm.write_bytes(b"music")
    final = tmp_path / "videos" / "episodes" / "ep001_final.mp4"
    final.parent.mkdir(parents=True)
    final.write_bytes(b"final")
    beats = [{"beat_number": 1, "narration_segment": "一句对白"}]

    episode_composition.write_episode_composition_manifest(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        source_paths=[bgm, video],
        resolution="1280x720",
        add_subtitles=True,
        add_bgm=True,
    )

    assert episode_composition.episode_composition_is_current(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        source_paths=[video, bgm],
        resolution="1280×720",
        add_subtitles=True,
        add_bgm=True,
    )
    assert not episode_composition.episode_composition_is_current(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        source_paths=[video, bgm],
        resolution="1280x720",
        add_subtitles=True,
        add_bgm=False,
    )
    bgm.write_bytes(b"new music")
    assert not episode_composition.episode_composition_is_current(
        project_dir=tmp_path,
        episode_num=1,
        beats=beats,
        source_paths=[video, bgm],
        resolution="1280x720",
        add_subtitles=True,
        add_bgm=True,
    )

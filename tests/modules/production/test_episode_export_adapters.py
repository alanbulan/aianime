from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure import episode_export
from ai_anime.modules.production.infrastructure.episode_export import (
    LocalEpisodeExportFiles,
)


@pytest.mark.asyncio
async def test_subtitle_content_uses_audio_duration_and_five_second_fallback(
    monkeypatch,
    tmp_path: Path,
) -> None:
    audio_dir = tmp_path / "audio" / "ep003"
    audio_dir.mkdir(parents=True)
    (audio_dir / "beat_01.mp3").write_bytes(b"audio")
    (audio_dir / "beat_02.mp3").write_bytes(b"audio")

    async def duration(audio_path: str) -> float:
        if audio_path.endswith("beat_01.mp3"):
            return 1.25
        raise RuntimeError("ffprobe missing")

    monkeypatch.setattr(episode_export, "get_audio_duration_async", duration)

    content = await LocalEpisodeExportFiles().subtitle_content(
        tmp_path,
        3,
        [
            {"beat_number": 1, "narration_segment": "Hello"},
            {"beat_number": 2, "narration_segment": "World"},
            {"beat_number": 3, "narration_segment": ""},
        ],
    )

    assert content == (
        "1\n"
        "00:00:00,000 --> 00:00:01,250\n"
        "Hello\n\n"
        "2\n"
        "00:00:01,250 --> 00:00:06,250\n"
        "World\n"
    )


@pytest.mark.asyncio
async def test_archive_contains_api_deliverables_and_inspection_assets(
    tmp_path: Path,
) -> None:
    paths = {
        "audio/ep003/beat_01.mp3": b"audio",
        "videos/beats/ep003/beat_01.mp4": b"beat-video",
        "videos/episodes/ep003_final.mp4": b"final-video",
        "frames/ep003/beat_01.png": b"frame",
        "grids/ep003/grid_01.png": b"grid",
    }
    for relative_path, content in paths.items():
        target = tmp_path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    adapter = LocalEpisodeExportFiles()
    archive_path = await adapter.create_archive(
        tmp_path,
        3,
        [{"beat_number": 1}],
        final_video_path=tmp_path / "videos/episodes/ep003_final.mp4",
        subtitle_content="subtitle",
    )

    with zipfile.ZipFile(archive_path) as archive:
        assert set(archive.namelist()) == {
            "audio/beat_01.mp3",
            "video/beat_01.mp4",
            "ep003_final.mp4",
            "frames/beat_01.png",
            "grids/grid_01.png",
            "ep003.srt",
        }
        assert archive.getinfo("ep003.srt").compress_type == zipfile.ZIP_DEFLATED
        assert archive.read("ep003.srt") == b"subtitle"

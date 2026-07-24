from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_export import (
    EpisodeExportUseCases,
    EpisodeScriptBeatsMissing,
    EpisodeSubtitlesMissing,
    FinalEpisodeVideoMissing,
)


class _BeatSource:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.calls: list[tuple[object, int]] = []

    async def for_episode(self, context, episode_num: int) -> list[dict]:
        self.calls.append((context, episode_num))
        return self.beats


class _Files:
    def __init__(self, subtitle: str = "subtitle") -> None:
        self.subtitle = subtitle
        self.subtitle_calls: list[tuple[Path, int, list[dict]]] = []
        self.archive_calls: list[dict] = []

    async def subtitle_content(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict],
    ) -> str:
        self.subtitle_calls.append((project_dir, episode_num, beats))
        return self.subtitle

    async def create_archive(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict],
        **kwargs,
    ) -> Path:
        self.archive_calls.append(
            {
                "project_dir": project_dir,
                "episode_num": episode_num,
                "beats": beats,
                **kwargs,
            }
        )
        return Path("episode.zip")


class _FinalVideos:
    def __init__(self, path: Path) -> None:
        self.final_path = path
        self.calls: list[tuple[object, int]] = []

    def path(self, context, episode_num: int) -> Path:
        self.calls.append((context, episode_num))
        return self.final_path


def _context(tmp_path: Path):
    return SimpleNamespace(
        output_dir=tmp_path,
        project_name="demo",
        project_id="proj-1",
    )


@pytest.mark.asyncio
async def test_subtitle_exports_exact_content_and_filename(tmp_path: Path) -> None:
    context = _context(tmp_path)
    beats = [{"beat_number": 1, "narration_segment": "Hello"}]
    source = _BeatSource(beats)
    files = _Files("1\n00:00:00,000 --> 00:00:05,000\nHello\n")
    use_cases = EpisodeExportUseCases(
        source,
        files,
        _FinalVideos(tmp_path / "final.mp4"),
    )

    result = await use_cases.subtitle(context, 3)

    assert result.content == files.subtitle
    assert result.filename == "ep003.srt"
    assert result.media_type == "text/srt"
    assert source.calls == [(context, 3)]
    assert files.subtitle_calls == [(tmp_path, 3, beats)]


@pytest.mark.asyncio
async def test_subtitle_rejects_missing_beats_before_file_adapter(
    tmp_path: Path,
) -> None:
    files = _Files()
    use_cases = EpisodeExportUseCases(
        _BeatSource([]),
        files,
        _FinalVideos(tmp_path / "final.mp4"),
    )

    with pytest.raises(EpisodeScriptBeatsMissing, match="No beats in script"):
        await use_cases.subtitle(_context(tmp_path), 3)

    assert files.subtitle_calls == []


@pytest.mark.asyncio
async def test_subtitle_rejects_beats_without_narration(tmp_path: Path) -> None:
    use_cases = EpisodeExportUseCases(
        _BeatSource([{"beat_number": 1}]),
        _Files(""),
        _FinalVideos(tmp_path / "final.mp4"),
    )

    with pytest.raises(EpisodeSubtitlesMissing, match="No subtitles to export"):
        await use_cases.subtitle(_context(tmp_path), 3)


def test_final_video_uses_canonical_catalog_path(tmp_path: Path) -> None:
    context = _context(tmp_path)
    final_path = tmp_path / "videos" / "episodes" / "ep003_final.mp4"
    final_path.parent.mkdir(parents=True)
    final_path.write_bytes(b"video")
    catalog = _FinalVideos(final_path)
    use_cases = EpisodeExportUseCases(_BeatSource([]), _Files(), catalog)

    result = use_cases.final_video(context, 3)

    assert result.path == final_path
    assert result.filename == "ep003_final.mp4"
    assert result.media_type == "video/mp4"
    assert catalog.calls == [(context, 3)]


def test_final_video_rejects_missing_file(tmp_path: Path) -> None:
    use_cases = EpisodeExportUseCases(
        _BeatSource([]),
        _Files(),
        _FinalVideos(tmp_path / "missing.mp4"),
    )

    with pytest.raises(FinalEpisodeVideoMissing, match="Final video not found"):
        use_cases.final_video(_context(tmp_path), 3)


@pytest.mark.asyncio
async def test_archive_passes_beats_subtitles_and_existing_final_video(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path)
    beats = [{"beat_number": 1}]
    final_path = tmp_path / "ep003_final.mp4"
    final_path.write_bytes(b"video")
    files = _Files("subtitle")
    use_cases = EpisodeExportUseCases(
        _BeatSource(beats),
        files,
        _FinalVideos(final_path),
    )

    result = await use_cases.archive(context, 3)

    assert result.path == Path("episode.zip")
    assert result.filename == "demo_ep003.zip"
    assert result.media_type == "application/zip"
    assert files.archive_calls == [
        {
            "project_dir": tmp_path,
            "episode_num": 3,
            "beats": beats,
            "final_video_path": final_path,
            "subtitle_content": "subtitle",
        }
    ]

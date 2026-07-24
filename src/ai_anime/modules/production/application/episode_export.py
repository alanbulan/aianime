"""Episode deliverable export application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeBeatSource,
    ProductionEpisodeExportFiles,
    ProductionFinalVideoCatalog,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class EpisodeTextExport:
    content: str
    filename: str
    media_type: str


@dataclass(frozen=True)
class EpisodeFileExport:
    path: Path
    filename: str
    media_type: str


class EpisodeScriptBeatsMissing(ValueError):
    def __init__(self) -> None:
        super().__init__("No beats in script")


class EpisodeSubtitlesMissing(ValueError):
    def __init__(self) -> None:
        super().__init__("No subtitles to export")


class FinalEpisodeVideoMissing(FileNotFoundError):
    def __init__(self) -> None:
        super().__init__("Final video not found")


class EpisodeExportUseCases:
    def __init__(
        self,
        beat_source: ProductionEpisodeBeatSource,
        files: ProductionEpisodeExportFiles,
        final_videos: ProductionFinalVideoCatalog,
    ) -> None:
        self._beat_source = beat_source
        self._files = files
        self._final_videos = final_videos

    async def subtitle(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> EpisodeTextExport:
        beats = await self._beat_source.for_episode(context, episode_num)
        if not beats:
            raise EpisodeScriptBeatsMissing()
        content = await self._files.subtitle_content(
            Path(context.output_dir),
            episode_num,
            beats,
        )
        if not content:
            raise EpisodeSubtitlesMissing()
        return EpisodeTextExport(
            content=content,
            filename=f"ep{episode_num:03d}.srt",
            media_type="text/srt",
        )

    def final_video(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> EpisodeFileExport:
        final_path = self._final_videos.path(context, episode_num)
        if not final_path.exists():
            raise FinalEpisodeVideoMissing()
        return EpisodeFileExport(
            path=final_path,
            filename=final_path.name,
            media_type="video/mp4",
        )

    async def archive(
        self,
        context: ProjectContext,
        episode_num: int,
    ) -> EpisodeFileExport:
        beats = await self._beat_source.for_episode(context, episode_num)
        project_dir = Path(context.output_dir)
        subtitle_content = await self._files.subtitle_content(
            project_dir,
            episode_num,
            beats,
        )
        final_path = self._final_videos.path(context, episode_num)
        archive_path = await self._files.create_archive(
            project_dir,
            episode_num,
            beats,
            final_video_path=final_path if final_path.exists() else None,
            subtitle_content=subtitle_content,
        )
        return EpisodeFileExport(
            path=archive_path,
            filename=f"{context.project_name}_ep{episode_num:03d}.zip",
            media_type="application/zip",
        )

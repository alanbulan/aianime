"""Local episode subtitle and archive export adapter."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

from ai_anime.modules.production.domain.subtitles import (
    build_subtitle_cues,
    split_subtitle_text,
)
from ai_anime.shared.utils.async_ops import call_blocking
from ai_anime.shared.utils.media_io import get_audio_duration_async
from ai_anime.shared.utils.path_resolver import PathResolver


def _format_srt_time(seconds: float) -> str:
    hours, remainder = divmod(round(seconds * 1000), 3600000)
    minutes, remainder = divmod(remainder, 60000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


class LocalEpisodeExportFiles:
    async def subtitle_content(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict],
    ) -> str:
        paths = PathResolver(str(project_dir), episode_num)
        srt_lines: list[str] = []
        captions: list[tuple[float, list[str]]] = []
        has_video_clips = any(
            paths.video(beat.get("beat_number", index)).exists()
            for index, beat in enumerate(beats, 1)
        )

        for index, beat in enumerate(beats, 1):
            beat_num = beat.get("beat_number", index)
            video_path = paths.video(beat_num)
            if has_video_clips and not video_path.exists():
                continue

            durations: list[float] = []
            for media_path in (video_path, paths.audio(beat_num)):
                if not media_path.exists():
                    continue
                try:
                    durations.append(await get_audio_duration_async(str(media_path)))
                except Exception:
                    continue
            duration = min(durations) if durations else 5.0
            captions.append(
                (duration, split_subtitle_text(str(beat.get("narration_segment") or "")))
            )

        for sequence, cue in enumerate(build_subtitle_cues(captions), 1):
            srt_lines.extend(
                (
                    str(sequence),
                    f"{_format_srt_time(cue.start)} --> "
                    f"{_format_srt_time(cue.end)}",
                    cue.text,
                    "",
                )
            )

        return "\n".join(srt_lines)

    async def create_archive(
        self,
        project_dir: Path,
        episode_num: int,
        beats: list[dict],
        *,
        final_video_path: Path | None,
        subtitle_content: str,
    ) -> Path:
        episode_tag = f"ep{episode_num:03d}"
        paths = PathResolver(str(project_dir), episode_num)
        files_to_pack: list[tuple[Path, str]] = []

        for beat in beats:
            beat_num = int(beat.get("beat_number", 0) or 0)
            if beat_num <= 0:
                continue
            audio_path = paths.audio(beat_num)
            if audio_path.exists():
                files_to_pack.append((audio_path, f"audio/{audio_path.name}"))
            video_path = paths.video(beat_num)
            if video_path.exists():
                files_to_pack.append((video_path, f"video/{video_path.name}"))

        if final_video_path is not None:
            files_to_pack.append((final_video_path, final_video_path.name))

        extra_dirs = {
            "frames": project_dir / "frames" / episode_tag,
            "grids": project_dir / "grids" / episode_tag,
        }
        for folder_name, folder in extra_dirs.items():
            if not folder.exists():
                continue
            for file_path in sorted(folder.iterdir()):
                if file_path.is_file():
                    files_to_pack.append(
                        (file_path, f"{folder_name}/{file_path.name}")
                    )

        temporary = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
        temporary.close()
        archive_path = Path(temporary.name)

        def write_archive() -> None:
            with zipfile.ZipFile(
                archive_path,
                "w",
                zipfile.ZIP_DEFLATED,
            ) as archive:
                for file_path, archive_name in files_to_pack:
                    archive.write(file_path, archive_name)
                if subtitle_content:
                    archive.writestr(f"{episode_tag}.srt", subtitle_content)

        await call_blocking(write_archive)
        return archive_path

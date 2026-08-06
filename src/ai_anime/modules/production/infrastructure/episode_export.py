"""Local episode subtitle and archive export adapter."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

from ai_anime.shared.utils.async_ops import call_blocking
from ai_anime.shared.utils.media_io import get_audio_duration_async
from ai_anime.shared.utils.path_resolver import PathResolver


def _format_srt_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
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
        current_time = 0.0
        sequence = 0

        for index, beat in enumerate(beats, 1):
            beat_num = beat.get("beat_number", index)
            narration = beat.get("narration_segment", "")
            if not narration:
                continue

            audio_path = paths.audio(beat_num)
            duration = 5.0
            if audio_path.exists():
                try:
                    duration = await get_audio_duration_async(str(audio_path))
                except Exception:
                    duration = 5.0

            start = current_time
            current_time += duration
            sequence += 1
            srt_lines.extend(
                (
                    str(sequence),
                    f"{_format_srt_time(start)} --> "
                    f"{_format_srt_time(current_time)}",
                    narration,
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

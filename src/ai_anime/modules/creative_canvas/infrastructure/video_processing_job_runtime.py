"""FFmpeg enhancement and audio-separation adapters for Creative Canvas."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.creative_canvas.application.job_execution import (
    SeparateCreativeCanvasAudioJobCommand,
    UpscaleCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.domain.video_processing import (
    build_creative_canvas_video_upscale_filter,
)
from ai_anime.modules.creative_canvas.infrastructure.media_process import (
    probe_media_has_audio,
    require_media_binary,
    run_media_command,
)
from ai_anime.shared.infrastructure.video_encoding import (
    ffmpeg_video_encoding_args,
)


class FfmpegCreativeCanvasVideoProcessingJobRuntime:
    def __init__(self, workspace: CreativeCanvasJobWorkspace) -> None:
        self._workspace = workspace

    async def upscale(
        self,
        command: UpscaleCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, object]]:
        if command.frame_interpolation != "none":
            raise ValueError(
                "basic video upscale only supports frame_interpolation='none'"
            )
        require_media_binary("ffmpeg")

        source_path = Path(command.source_path)
        if not source_path.exists():
            raise FileNotFoundError(f"video source not found: {source_path}")

        output_path = (
            self._workspace.output_directory(
                command.project_dir,
                "freezone_video_upscale",
            )
            / f"{command.job_id}.mp4"
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        video_filter = build_creative_canvas_video_upscale_filter(
            command.resolution,
            command.denoise_strength,
        )
        await run_media_command(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(source_path),
                "-vf",
                video_filter,
                *ffmpeg_video_encoding_args(preset="slow", crf=18),
                "-c:a",
                "copy",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        return output_path, {
            "backend": "ffmpeg",
            "resolution": command.resolution,
            "frame_interpolation": command.frame_interpolation,
            "denoise_strength": command.denoise_strength,
            "video_filter": video_filter,
        }

    async def separate_audio(
        self,
        command: SeparateCreativeCanvasAudioJobCommand,
    ) -> dict[str, Path | None]:
        require_media_binary("ffmpeg")
        require_media_binary("ffprobe")

        output_dir = self._workspace.output_directory(
            command.project_dir,
            "freezone_audio_separate",
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        audio_path = output_dir / f"{command.job_id}.m4a"
        muted_video_path = output_dir / f"{command.job_id}_mute.mp4"

        if await probe_media_has_audio(command.source_path):
            await run_media_command(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    command.source_path,
                    "-vn",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    str(audio_path),
                ]
            )

        await run_media_command(
            [
                "ffmpeg",
                "-y",
                "-i",
                command.source_path,
                "-c:v",
                "copy",
                "-an",
                str(muted_video_path),
            ]
        )
        if not muted_video_path.exists():
            raise RuntimeError("audio separate finished without muted video output")
        return {
            "audio_path": audio_path if audio_path.exists() else None,
            "mute_video_path": muted_video_path,
        }

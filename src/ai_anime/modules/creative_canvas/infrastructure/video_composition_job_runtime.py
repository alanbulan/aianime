"""FFmpeg timeline-composition adapter for Creative Canvas."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any, Mapping

from ai_anime.modules.creative_canvas.application.job_execution import (
    ComposeCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.domain.video_processing import (
    CREATIVE_CANVAS_VIDEO_RESOLUTIONS,
    validate_video_composition_source_range,
    validate_video_composition_video_item_count,
)
from ai_anime.modules.creative_canvas.infrastructure.media_process import (
    probe_media_has_audio,
    require_media_binary,
    run_media_command,
)
from ai_anime.shared.infrastructure.video_encoding import (
    ffmpeg_video_encoding_args,
)


async def _render_gap_clip(
    *,
    output_path: Path,
    duration: float,
    width: int,
    height: int,
    fps: int,
    background_color: str,
) -> None:
    await run_media_command(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={background_color}:s={width}x{height}:r={fps}",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-t",
            f"{duration:.3f}",
            *ffmpeg_video_encoding_args(preset="veryfast", crf=20),
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-shortest",
            str(output_path),
        ]
    )


async def _render_video_clip(
    *,
    source_path: str,
    output_path: Path,
    source_start: float,
    duration: float,
    speed: float,
    width: int,
    height: int,
    fps: int,
    background_color: str,
    keep_original_audio: bool,
    volume: float,
    muted: bool,
) -> None:
    output_duration = duration / speed
    video_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={background_color},"
        f"fps={fps},setpts=PTS/{speed:.6f}"
    )
    has_audio = (
        keep_original_audio
        and not muted
        and await probe_media_has_audio(source_path)
    )
    if has_audio:
        command = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{source_start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source_path,
            "-vf",
            video_filter,
            *ffmpeg_video_encoding_args(preset="veryfast", crf=20),
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-af",
            f"{_audio_speed_filter(speed)},volume={volume:.4f}",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    else:
        command = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{source_start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source_path,
            "-f",
            "lavfi",
            "-t",
            f"{output_duration:.3f}",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            video_filter,
            *ffmpeg_video_encoding_args(preset="veryfast", crf=20),
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    await run_media_command(command)


async def _render_audio_clip(
    *,
    source_path: str,
    output_path: Path,
    source_start: float,
    duration: float,
    speed: float,
    volume: float,
) -> None:
    await run_media_command(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{source_start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source_path,
            "-vn",
            "-af",
            f"{_audio_speed_filter(speed)},volume={volume:.4f}",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            str(output_path),
        ]
    )


def _audio_speed_filter(speed: float) -> str:
    factors: list[float] = []
    remaining = speed
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    factors.append(remaining)
    return ",".join(f"atempo={factor:.6f}" for factor in factors)


async def _concat_media_segments(
    segment_paths: list[Path],
    output_path: Path,
) -> None:
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        suffix=".txt",
        delete=False,
    ) as handle:
        for path in segment_paths:
            safe_path = str(path).replace("'", "'\\''")
            handle.write(f"file '{safe_path}'\n")
        list_path = Path(handle.name)
    try:
        await run_media_command(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                *ffmpeg_video_encoding_args(preset="veryfast", crf=20),
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
    finally:
        list_path.unlink(missing_ok=True)


async def _mix_audio_tracks(
    *,
    base_video_path: Path,
    final_output_path: Path,
    audio_items: list[Mapping[str, Any]],
    temp_dir: Path,
) -> None:
    audio_inputs: list[tuple[Path, float]] = []
    for index, item in enumerate(audio_items):
        if bool(item.get("muted")):
            continue
        volume = float(item.get("volume", 1.0) or 1.0)
        if volume <= 0:
            continue
        source_start = float(item.get("source_start", 0.0) or 0.0)
        source_end = float(item.get("source_end", 0.0) or 0.0)
        duration = source_end - source_start
        speed = float(item.get("speed", 1.0) or 1.0)
        if duration <= 0:
            continue
        audio_path = temp_dir / f"audio_track_{index:03d}.m4a"
        await _render_audio_clip(
            source_path=str(item["source_path"]),
            output_path=audio_path,
            source_start=source_start,
            duration=duration,
            speed=speed,
            volume=volume,
        )
        audio_inputs.append(
            (audio_path, float(item.get("timeline_start", 0.0) or 0.0))
        )

    if not audio_inputs:
        shutil.move(str(base_video_path), str(final_output_path))
        return

    command = ["ffmpeg", "-y", "-i", str(base_video_path)]
    filter_parts: list[str] = []
    labels = ["[0:a]"]
    for index, (audio_path, timeline_start) in enumerate(audio_inputs, start=1):
        delay_ms = max(0, int(round(timeline_start * 1000.0)))
        command.extend(["-i", str(audio_path)])
        filter_parts.append(
            f"[{index}:a]adelay={delay_ms}|{delay_ms}[a{index}]"
        )
        labels.append(f"[a{index}]")
    filter_parts.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:"
        "duration=first:dropout_transition=0[aout]"
    )
    command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "0:v:0",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(final_output_path),
        ]
    )
    await run_media_command(command)


class FfmpegCreativeCanvasVideoCompositionJobRuntime:
    def __init__(self, workspace: CreativeCanvasJobWorkspace) -> None:
        self._workspace = workspace

    async def compose(
        self,
        command: ComposeCreativeCanvasVideoJobCommand,
    ) -> Path:
        require_media_binary("ffmpeg")
        require_media_binary("ffprobe")

        width, height = CREATIVE_CANVAS_VIDEO_RESOLUTIONS.get(
            command.resolution,
            CREATIVE_CANVAS_VIDEO_RESOLUTIONS["1080p"],
        )
        output_dir = self._workspace.output_directory(
            command.project_dir,
            "freezone_video_compose",
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        final_output_path = output_dir / f"{command.job_id}.mp4"

        video_items = [
            item
            for track in command.tracks
            if str(track.get("kind") or "") == "video"
            for item in (track.get("items") or [])
        ]
        audio_items = [
            item
            for track in command.tracks
            if str(track.get("kind") or "") == "audio"
            for item in (track.get("items") or [])
        ]
        try:
            validate_video_composition_video_item_count(len(video_items))
        except ValueError as exc:
            raise RuntimeError(
                "video compose requires at least one video clip"
            ) from exc

        sorted_video_items = sorted(
            video_items,
            key=lambda item: (
                float(item.get("timeline_start", 0.0) or 0.0),
                str(item.get("item_id") or ""),
            ),
        )
        with tempfile.TemporaryDirectory(
            prefix=f"freezone_compose_{command.job_id}_"
        ) as temp_dir_value:
            temp_dir = Path(temp_dir_value)
            segment_paths: list[Path] = []
            cursor = 0.0
            for index, item in enumerate(sorted_video_items):
                timeline_start = float(item.get("timeline_start", 0.0) or 0.0)
                source_start = float(item.get("source_start", 0.0) or 0.0)
                source_end = float(item.get("source_end", 0.0) or 0.0)
                item_id = str(item.get("item_id") or index)
                try:
                    validate_video_composition_source_range(
                        item_id,
                        source_start,
                        source_end,
                    )
                except ValueError as exc:
                    raise RuntimeError(
                        f"compose item {item_id} has invalid source range"
                    ) from exc
                duration = source_end - source_start
                speed = float(item.get("speed", 1.0) or 1.0)
                output_duration = duration / speed
                if timeline_start < cursor - 1e-6:
                    raise RuntimeError(
                        "overlapping video clips are not supported in MVP compose"
                    )
                if timeline_start > cursor + 1e-6:
                    gap_path = temp_dir / f"gap_{index:03d}.mp4"
                    await _render_gap_clip(
                        output_path=gap_path,
                        duration=timeline_start - cursor,
                        width=width,
                        height=height,
                        fps=command.fps,
                        background_color=command.background_color,
                    )
                    segment_paths.append(gap_path)
                    cursor = timeline_start

                clip_path = temp_dir / f"video_{index:03d}.mp4"
                await _render_video_clip(
                    source_path=str(item["source_path"]),
                    output_path=clip_path,
                    source_start=source_start,
                    duration=duration,
                    speed=speed,
                    width=width,
                    height=height,
                    fps=command.fps,
                    background_color=command.background_color,
                    keep_original_audio=command.keep_original_audio,
                    volume=float(item.get("volume", 1.0) or 1.0),
                    muted=bool(item.get("muted")),
                )
                segment_paths.append(clip_path)
                cursor = timeline_start + output_duration

            concatenated_path = temp_dir / "concatenated.mp4"
            await _concat_media_segments(segment_paths, concatenated_path)
            await _mix_audio_tracks(
                base_video_path=concatenated_path,
                final_output_path=final_output_path,
                audio_items=audio_items,
                temp_dir=temp_dir,
            )

        if not final_output_path.exists():
            raise RuntimeError("video compose finished without output file")
        return final_output_path

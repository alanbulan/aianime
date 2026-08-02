"""FFmpeg fixed-overlay erasure adapter for Creative Canvas."""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from ai_anime.modules.creative_canvas.application.job_execution import (
    EraseCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)
from ai_anime.modules.creative_canvas.domain.video_processing import (
    validate_video_erase_box,
)
from ai_anime.modules.creative_canvas.infrastructure.media_process import (
    probe_video_duration,
    probe_video_size,
    require_media_binary,
    run_media_command,
)


def _expand_mask(mask: np.ndarray, radius: int = 2) -> np.ndarray:
    expanded = mask.copy()
    for delta_y in range(-radius, radius + 1):
        for delta_x in range(-radius, radius + 1):
            if delta_x == 0 and delta_y == 0:
                continue
            expanded |= np.roll(
                np.roll(mask, delta_y, axis=0),
                delta_x,
                axis=1,
            )
    return expanded


def _safe_box_from_pixels(
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    width: int,
    height: int,
    *,
    pad_x: int = 12,
    pad_y: int = 10,
) -> tuple[int, int, int, int]:
    left = max(0, x0 - pad_x)
    top = max(0, y0 - pad_y)
    right = min(width, x1 + pad_x)
    bottom = min(height, y1 + pad_y)
    return left, top, max(8, right - left), max(8, bottom - top)


def _fallback_subtitle_box(
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    box_width = int(width * 0.8)
    box_height = max(24, int(height * 0.16))
    x = int((width - box_width) / 2)
    y = int(height * 0.78)
    y = min(max(0, y), max(0, height - box_height))
    return x, y, box_width, box_height


def _detect_subtitle_box_from_image(
    image_path: Path,
) -> tuple[int, int, int, int] | None:
    image = Image.open(image_path).convert("RGB")
    pixels = np.asarray(image, dtype=np.int16)
    height, width = pixels.shape[:2]
    start_y = int(height * 0.55)
    region = pixels[start_y:, :, :]
    gray = (
        (
            region[:, :, 0] * 299
            + region[:, :, 1] * 587
            + region[:, :, 2] * 114
        )
        // 1000
    ).astype(np.int16)
    edge = np.zeros_like(gray)
    edge[:, 1:] += np.abs(gray[:, 1:] - gray[:, :-1])
    edge[1:, :] += np.abs(gray[1:, :] - gray[:-1, :])
    candidate = ((gray >= 205) | (gray <= 50)) & (edge >= 42)
    candidate = _expand_mask(candidate, radius=2)

    ys, xs = np.where(candidate)
    if len(xs) < max(80, width // 120):
        return None
    x0 = int(xs.min())
    x1 = int(xs.max()) + 1
    y0 = int(ys.min()) + start_y
    y1 = int(ys.max()) + 1 + start_y
    if (x1 - x0) < width * 0.12 or (y1 - y0) < 10:
        return None
    if (y1 - y0) > height * 0.22:
        return None
    return _safe_box_from_pixels(x0, y0, x1, y1, width, height)


async def _extract_sample_frames(
    video_path: str,
    temp_dir: Path,
    count: int = 6,
) -> list[Path]:
    duration = await probe_video_duration(video_path)
    sample_paths: list[Path] = []
    for index in range(count):
        timestamp = duration * (index + 1) / (count + 1)
        output_path = temp_dir / f"sample_{index:02d}.png"
        await run_media_command(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                video_path,
                "-frames:v",
                "1",
                str(output_path),
            ]
        )
        if output_path.exists():
            sample_paths.append(output_path)
    return sample_paths


async def _detect_subtitle_box(
    video_path: str,
    temp_dir: Path,
) -> tuple[int, int, int, int]:
    width, height = await probe_video_size(video_path)
    sample_paths = await _extract_sample_frames(video_path, temp_dir)
    boxes = [
        box
        for box in (
            _detect_subtitle_box_from_image(path) for path in sample_paths
        )
        if box
    ]
    if not boxes:
        return _fallback_subtitle_box(width, height)

    left = int(np.median([box[0] for box in boxes]))
    top = int(np.median([box[1] for box in boxes]))
    right = int(np.median([box[0] + box[2] for box in boxes]))
    bottom = int(np.median([box[1] + box[3] for box in boxes]))
    return _safe_box_from_pixels(left, top, right, bottom, width, height)


def _normalized_box_to_pixels(
    *,
    box_x: float,
    box_y: float,
    box_width: float,
    box_height: float,
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    x = int(round(box_x * width))
    y = int(round(box_y * height))
    result_width = int(round(box_width * width))
    result_height = int(round(box_height * height))
    x = min(max(0, x), max(0, width - 8))
    y = min(max(0, y), max(0, height - 8))
    result_width = min(max(8, result_width), width - x)
    result_height = min(max(8, result_height), height - y)
    return x, y, result_width, result_height


async def _render_delogo_video(
    *,
    source_path: str,
    output_path: Path,
    x: int,
    y: int,
    width: int,
    height: int,
) -> None:
    await run_media_command(
        [
            "ffmpeg",
            "-y",
            "-i",
            source_path,
            "-vf",
            f"delogo=x={x}:y={y}:w={width}:h={height}:show=0",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "copy",
            str(output_path),
        ]
    )


class FfmpegCreativeCanvasVideoEraseJobRuntime:
    def __init__(self, workspace: CreativeCanvasJobWorkspace) -> None:
        self._workspace = workspace

    async def erase(
        self,
        command: EraseCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, int | str]]:
        require_media_binary("ffmpeg")
        require_media_binary("ffprobe")

        output_dir = self._workspace.output_directory(
            command.project_dir,
            "freezone_video_erase",
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{command.job_id}.mp4"
        video_width, video_height = await probe_video_size(command.source_path)

        try:
            validate_video_erase_box(
                command.mode,
                box_x=command.box_x,
                box_y=command.box_y,
                box_width=command.box_width,
                box_height=command.box_height,
            )
        except ValueError as exc:
            raise RuntimeError(str(exc)) from exc

        with tempfile.TemporaryDirectory(
            prefix=f"freezone_erase_{command.job_id}_"
        ) as temp_dir_value:
            temp_dir = Path(temp_dir_value)
            if command.mode == "smart_subtitle":
                x, y, width, height = await _detect_subtitle_box(
                    command.source_path,
                    temp_dir,
                )
            elif command.mode == "box":
                x, y, width, height = _normalized_box_to_pixels(
                    box_x=float(command.box_x),
                    box_y=float(command.box_y),
                    box_width=float(command.box_width),
                    box_height=float(command.box_height),
                    width=video_width,
                    height=video_height,
                )
            else:
                raise RuntimeError(f"unsupported erase mode: {command.mode}")
            await _render_delogo_video(
                source_path=command.source_path,
                output_path=output_path,
                x=x,
                y=y,
                width=width,
                height=height,
            )

        if not output_path.exists():
            raise RuntimeError("video erase finished without output file")
        return output_path, {
            "mode": command.mode,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
        }

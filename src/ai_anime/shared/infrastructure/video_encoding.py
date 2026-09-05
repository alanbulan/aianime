"""Cross-platform FFmpeg video encoder arguments."""

from __future__ import annotations

import os

VIDEO_CODEC = os.environ.get("VIDEO_CODEC", "libx264")


def configured_video_codec() -> str:
    return str(VIDEO_CODEC or "libx264").strip() or "libx264"


def ffmpeg_video_quality_args(
    *,
    codec: str | None = None,
    preset: str = "medium",
    crf: int = 20,
    bitrate: str | None = None,
) -> list[str]:
    resolved_codec = str(codec or configured_video_codec()).strip()
    if resolved_codec == "libx264":
        return ["-preset", preset, "-crf", str(crf)]
    if resolved_codec == "libopenh264":
        resolved_bitrate = bitrate or ("8M" if crf <= 18 else "4M")
        return [
            "-profile:v",
            "main",
            "-rc_mode",
            "bitrate",
            "-allow_skip_frames",
            "1",
            "-b:v",
            resolved_bitrate,
        ]
    if resolved_codec == "h264_videotoolbox":
        resolved_bitrate = bitrate or ("8M" if crf <= 18 else "4M")
        # Prefer hardware, but allow VideoToolbox's software encoder on Macs
        # without an available hardware compression session (including CI).
        return ["-allow_sw", "1", "-b:v", resolved_bitrate]
    return []


def ffmpeg_video_encoding_args(
    *,
    codec: str | None = None,
    preset: str = "medium",
    crf: int = 20,
    bitrate: str | None = None,
) -> list[str]:
    resolved_codec = str(codec or configured_video_codec()).strip()
    return [
        "-c:v",
        resolved_codec,
        *ffmpeg_video_quality_args(
            codec=resolved_codec,
            preset=preset,
            crf=crf,
            bitrate=bitrate,
        ),
    ]

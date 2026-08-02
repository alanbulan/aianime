"""Shared subprocess primitives for Creative Canvas media jobs."""

from __future__ import annotations

import asyncio
import shutil
import subprocess


def require_media_binary(name: str) -> None:
    if not shutil.which(name):
        raise RuntimeError(f"{name} not found on PATH; install via brew/apt")


async def run_media_command(cmd: list[str], *, timeout: int = 1800) -> None:
    proc = await asyncio.to_thread(
        subprocess.run,
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(stderr[-1000:] or f"command failed: {' '.join(cmd)}")


async def probe_media_has_audio(source_path: str) -> bool:
    proc = await asyncio.to_thread(
        subprocess.run,
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            source_path,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return proc.returncode == 0 and bool((proc.stdout or "").strip())


async def probe_video_size(source_path: str) -> tuple[int, int]:
    proc = await asyncio.to_thread(
        subprocess.run,
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            source_path,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "").strip()[-500:] or "ffprobe size failed")
    value = (proc.stdout or "").strip()
    try:
        width_text, height_text = value.split("x", 1)
        return int(width_text), int(height_text)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"unable to parse video size: {value}") from exc


async def probe_video_duration(source_path: str) -> float:
    proc = await asyncio.to_thread(
        subprocess.run,
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            source_path,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            (proc.stderr or "").strip()[-500:] or "ffprobe duration failed"
        )
    try:
        return max(0.1, float((proc.stdout or "").strip()))
    except ValueError as exc:
        raise RuntimeError("unable to parse video duration") from exc

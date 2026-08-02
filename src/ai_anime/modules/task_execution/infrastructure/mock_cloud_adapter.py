"""Deterministic local cloud adapter used by the desktop milestone build."""

from __future__ import annotations

import asyncio
import binascii
import math
import os
import shutil
import struct
import subprocess
import wave
import zlib
from pathlib import Path
from typing import Any

from ai_anime.modules.task_execution.application.cloud_tasks import (
    CancellationCheck,
    CloudTaskCancelled,
    CloudTaskRequest,
    CloudTaskResult,
    ProgressCallback,
)


def _chunk(name: bytes, data: bytes) -> bytes:
    checksum = binascii.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", checksum)


def _write_png(path: Path, *, width: int = 640, height: int = 360) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend((24 + (x * 48 // width), 32 + (y * 64 // height), 48))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(bytes(rows), level=9))
        + _chunk(b"IEND", b"")
    )


def _write_wav(path: Path, *, duration_seconds: float = 1.5) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16_000
    frame_count = int(sample_rate * duration_seconds)
    frames = bytearray()
    for index in range(frame_count):
        sample = int(1800 * math.sin(2 * math.pi * 440 * index / sample_rate))
        frames.extend(struct.pack("<h", sample))
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(bytes(frames))


def _write_video(path: Path) -> bool:
    configured = os.environ.get("FFMPEG_PATH", "").strip()
    executable = configured if configured and Path(configured).is_file() else shutil.which("ffmpeg")
    if not executable:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [
            str(executable),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x182030:s=640x360:d=2",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo",
            "-shortest",
            "-c:v",
            "mpeg4",
            "-q:v",
            "5",
            "-c:a",
            "aac",
            str(path),
        ],
        capture_output=True,
        check=False,
        timeout=30,
    )
    return completed.returncode == 0 and path.is_file() and path.stat().st_size > 0


def _prompt_excerpt(payload: dict[str, Any]) -> str:
    for key in ("prompt", "text", "content", "title", "description"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value[:160]
    return "Desktop mock generation"


class MockCloudAdapter:
    name = "mock"

    def __init__(self, *, step_delay_seconds: float | None = None) -> None:
        if step_delay_seconds is None:
            raw_delay = os.environ.get("AI_ANIME_MOCK_STEP_DELAY_MS", "120")
            try:
                step_delay_seconds = max(float(raw_delay), 0.0) / 1000.0
            except ValueError:
                step_delay_seconds = 0.12
        self._step_delay_seconds = step_delay_seconds

    async def run_task(
        self,
        request: CloudTaskRequest,
        *,
        report_progress: ProgressCallback,
        is_cancelled: CancellationCheck,
    ) -> CloudTaskResult:
        for progress, message in (
            (0.15, "Preparing mock request"),
            (0.45, "Generating mock output"),
            (0.8, "Finalizing mock output"),
        ):
            self._raise_if_cancelled(is_cancelled)
            await report_progress(progress, message)
            if self._step_delay_seconds:
                await asyncio.sleep(self._step_delay_seconds)

        self._raise_if_cancelled(is_cancelled)
        output = await self._build_output(request)
        return CloudTaskResult(
            provider_task_id=f"mock-{request.task_id}",
            provider=self.name,
            model=f"mock-{request.kind}-v1",
            kind=request.kind,
            output={"mock": True, "task_type": request.task_type, **output},
        )

    @staticmethod
    def _raise_if_cancelled(is_cancelled: CancellationCheck) -> None:
        if is_cancelled():
            raise CloudTaskCancelled("mock cloud task cancelled")

    async def _build_output(self, request: CloudTaskRequest) -> dict[str, Any]:
        excerpt = _prompt_excerpt(request.payload)
        if request.kind == "text":
            text = f"Mock text result for {request.task_type}: {excerpt}"
            return {"text": text, "content": text}
        if request.kind == "story":
            return {
                "summary": f"Mock story analysis for {excerpt}",
                "nodes": [
                    {"id": "scene-1", "type": "scene", "label": "Opening"},
                    {"id": "beat-1", "type": "beat", "label": "First beat"},
                ],
                "edges": [{"source": "scene-1", "target": "beat-1"}],
            }

        artifact_dir = request.output_dir / ".mock-cloud" / request.task_id
        if request.kind == "image":
            path = artifact_dir / "preview.png"
            await asyncio.to_thread(_write_png, path)
            return {
                "path": str(path.resolve()),
                "image_path": str(path.resolve()),
                "width": 640,
                "height": 360,
            }
        if request.kind == "audio":
            path = artifact_dir / "preview.wav"
            await asyncio.to_thread(_write_wav, path)
            return {
                "path": str(path.resolve()),
                "audio_path": str(path.resolve()),
                "duration": 1.5,
            }

        path = artifact_dir / "preview.mp4"
        generated = await asyncio.to_thread(_write_video, path)
        output: dict[str, Any] = {"duration": 2.0, "preview_available": generated}
        if generated:
            output.update(
                {
                    "path": str(path.resolve()),
                    "video_path": str(path.resolve()),
                }
            )
        return output


__all__ = ["MockCloudAdapter"]

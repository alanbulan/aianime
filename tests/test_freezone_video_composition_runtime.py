from pathlib import Path
from array import array
import shutil
import subprocess

import pytest

from ai_anime.modules.creative_canvas.application.job_execution import (
    ComposeCreativeCanvasVideoJobCommand,
)
from ai_anime.modules.creative_canvas.infrastructure import (
    video_composition_job_runtime as runtime_module,
)


class _Workspace:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def output_directory(self, _project_dir: Path, _task_type: str) -> Path:
        return self.output_dir


@pytest.mark.asyncio
async def test_composition_uses_speed_for_rendering_and_timeline_cursor(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    rendered: list[dict[str, object]] = []

    async def render_video(**kwargs):
        rendered.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"clip")

    async def concat(_segments, output_path):
        Path(output_path).write_bytes(b"concat")

    async def mix(*, final_output_path, **_kwargs):
        Path(final_output_path).write_bytes(b"final")

    monkeypatch.setattr(runtime_module, "require_media_binary", lambda _name: None)
    monkeypatch.setattr(runtime_module, "_render_video_clip", render_video)
    monkeypatch.setattr(runtime_module, "_concat_media_segments", concat)
    monkeypatch.setattr(runtime_module, "_mix_audio_tracks", mix)

    result = await runtime_module.FfmpegCreativeCanvasVideoCompositionJobRuntime(
        _Workspace(tmp_path / "outputs")
    ).compose(
        ComposeCreativeCanvasVideoJobCommand(
            project_dir=tmp_path,
            job_id="speed",
            tracks=(
                {
                    "kind": "video",
                    "items": [
                        {
                            "item_id": "first",
                            "source_path": "first.mp4",
                            "source_start": 0,
                            "source_end": 10,
                            "timeline_start": 0,
                            "speed": 2,
                        },
                        {
                            "item_id": "second",
                            "source_path": "second.mp4",
                            "source_start": 0,
                            "source_end": 10,
                            "timeline_start": 5,
                            "speed": 2,
                        },
                    ],
                },
            ),
        )
    )

    assert result.read_bytes() == b"final"
    assert [item["speed"] for item in rendered] == [2.0, 2.0]
    assert runtime_module._audio_speed_filter(0.25) == (
        "atempo=0.500000,atempo=0.500000"
    )


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
                    reason="requires local FFmpeg and FFprobe")
@pytest.mark.asyncio
async def test_native_composition_exports_a_repeated_muted_clip(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    await runtime_module.run_media_command([
        "ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=20:d=2",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-c:v", "libx264", "-c:a", "aac", "-shortest", str(source),
    ])
    result = await runtime_module.FfmpegCreativeCanvasVideoCompositionJobRuntime(
        _Workspace(tmp_path / "outputs")
    ).compose(ComposeCreativeCanvasVideoJobCommand(
        project_dir=tmp_path, job_id="muted-repeat", resolution="720p", fps=20,
        tracks=({"kind": "video", "items": [
            {"item_id": str(index), "source_path": str(source), "source_start": 0.25,
             "source_end": 1.25, "timeline_start": index, "muted": True}
            for index in range(2)
        ]},),
    ))
    duration = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(result),
    ], check=True, capture_output=True, text=True, timeout=30)
    assert float(duration.stdout) == pytest.approx(2, abs=0.15)

    def peak_audio(path: Path) -> float:
        decoded = subprocess.run([
            "ffmpeg", "-v", "error", "-i", str(path), "-vn", "-f", "f32le", "pipe:1",
        ], check=True, capture_output=True, timeout=30)
        samples = array("f")
        samples.frombytes(decoded.stdout)
        assert samples
        return max(abs(value) for value in samples)

    assert peak_audio(source) > 0.01
    assert peak_audio(result) < 0.0001

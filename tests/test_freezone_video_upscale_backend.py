from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.canvas_video_schemas import FreezoneVideoUpscaleRequest
from ai_anime.api.routes.canvas import video as video_routes
from ai_anime.freezone.jobs import _video_upscale_filter
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
)
from ai_anime.modules.creative_canvas.application.video_processing import (
    CreativeCanvasVideoProcessingUseCases,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)


def test_video_upscale_filter_uses_lanczos_and_enhancement() -> None:
    video_filter = _video_upscale_filter("1080p", "1x")

    assert "scale='if(gte(iw,ih),1920,-2)'" in video_filter
    assert "flags=lanczos" in video_filter
    assert "hqdn3d=1.2:1.2:4:4" in video_filter
    assert "unsharp=5:5:0.55:3:3:0.25" in video_filter
    assert video_filter.endswith("format=yuv420p")


@pytest.mark.asyncio
async def test_freezone_video_upscale_route_starts_task(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    username = "admin"
    project = "58"
    video_path = tmp_path / "freezone" / "_uploads" / "clip.mp4"
    video_path.parent.mkdir(parents=True)
    video_path.write_bytes(b"mp4")
    captured: dict[str, object] = {}
    context = SimpleNamespace(project_id=project)
    resolution = SimpleNamespace(ctx=context, project_dir=tmp_path)

    async def fake_resolve_project_scope(project_: str, user: dict, **kwargs):
        assert project_ == project
        assert user == {"username": username}
        assert kwargs == {
            "required_role": "editor",
            "operation": "access freezone project files",
        }
        return resolution

    class FixedJobIds:
        def new_id(self):
            return "upscale_job"

    class Scheduler:
        async def enqueue(self, ctx, task):
            captured["ctx"] = ctx
            captured["task"] = task
            return CreativeCanvasTaskReceipt(
                task_type=task.task_type,
                job_id=task.job_id,
                task_key=f"task:{task.task_type}:{task.job_id}",
                task_episode=0,
                task_scope=task.job_id,
                backend="inline",
                queue="ffmpeg",
                task_id="task-upscale",
            )

    use_cases = CreativeCanvasVideoProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        FixedJobIds(),
        Scheduler(),
    )

    monkeypatch.setattr(
        video_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        video_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: use_cases,
    )

    result = await video_routes.freezone_video_upscale(
        project=project,
        body=FreezoneVideoUpscaleRequest(
            source_url="/static/admin/58/freezone/_uploads/clip.mp4",
            resolution="2k",
            frame_interpolation="none",
            denoise_strength="2x",
        ),
        user={"username": username},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_video_upscale"
    assert result["data"]["job_id"] == "upscale_job"
    assert result["data"]["backend"] == "inline"
    assert result["data"]["queue"] == "ffmpeg"
    assert result["data"]["task_id"] == "task-upscale"
    assert "freezone_video_upscale" in result["data"]["task_key"]
    assert captured["ctx"].project_id == project
    task = captured["task"]
    assert task.task_type == "freezone_video_upscale"
    assert task.queue_kind == "ffmpeg"
    assert task.job_id == "upscale_job"
    assert task.payload["source_path"] == video_path.as_posix()
    assert task.payload["resolution"] == "2k"
    assert task.payload["frame_interpolation"] == "none"
    assert task.payload["denoise_strength"] == "2x"


@pytest.mark.asyncio
async def test_freezone_video_upscale_route_maps_runtime_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(
            ctx=SimpleNamespace(project_id="58"),
            project_dir=tmp_path,
        )

    class FailingUseCases:
        async def start_video_upscale(self, _command):
            raise RuntimeError("ffmpeg queue unavailable")

    monkeypatch.setattr(
        video_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        video_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await video_routes.freezone_video_upscale(
            project="58",
            body=FreezoneVideoUpscaleRequest(source_url="clip.mp4"),
            user={"username": "admin"},
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == (
        "failed to start freezone video upscale task: ffmpeg queue unavailable"
    )

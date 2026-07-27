from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.canvas import video as video_processing_routes
from ai_anime.api.schemas import FreezoneExtractFramesRequest
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.application.video_processing import (
    CREATIVE_CANVAS_FRAME_EXTRACTION_TASK_TYPE,
    CREATIVE_CANVAS_SHOT_ANALYSIS_TASK_TYPE,
    CREATIVE_CANVAS_VIDEO_STORY_TASK_TYPE,
    CREATIVE_CANVAS_VIDEO_UPSCALE_TASK_TYPE,
    CreativeCanvasVideoProcessingSourceMissing,
    CreativeCanvasVideoProcessingUseCases,
    InvalidCreativeCanvasVideoProcessingRequest,
    StartCreativeCanvasFrameExtractionCommand,
    StartCreativeCanvasShotAnalysisCommand,
    StartCreativeCanvasVideoUpscaleCommand,
    StartCreativeCanvasVideoStoryAnalysisCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _project_context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _write_media(path: Path, contents: bytes = b"media") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)
    return path


def _receipt(task_type: str, job_id: str) -> CreativeCanvasTaskReceipt:
    return CreativeCanvasTaskReceipt(
        task_type=task_type,
        job_id=job_id,
        task_key=f"task:{task_type}:{job_id}",
        task_episode=0,
        task_scope=job_id,
        backend="celery",
        queue="default",
        task_id="task-1",
    )


class _FixedJobIds:
    def __init__(self, *job_ids: str) -> None:
        self._job_ids = iter(job_ids)

    def new_id(self) -> str:
        return next(self._job_ids)


class _CapturingScheduler:
    def __init__(self, context: ProjectContext) -> None:
        self.context = context
        self.tasks: list[CreativeCanvasTaskSubmission] = []

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        assert context is self.context
        self.tasks.append(task)
        return _receipt(task.task_type, task.job_id)


@pytest.mark.asyncio
async def test_video_processing_enqueues_exact_task_payloads(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    project_dir = context.output_dir
    video = _write_media(project_dir / "freezone" / "_uploads" / "clip.mp4")
    frame_a = _write_media(project_dir / "freezone" / "_uploads" / "frame-a.png")
    frame_b = _write_media(project_dir / "freezone" / "_uploads" / "frame-b.png")
    scheduler = _CapturingScheduler(context)
    use_cases = CreativeCanvasVideoProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        _FixedJobIds("job-extract", "job-analyze", "job-story", "job-upscale"),
        scheduler,
    )

    extract = await use_cases.start_frame_extraction(
        StartCreativeCanvasFrameExtractionCommand(
            context=context,
            project_dir=project_dir,
            video_url="freezone/_uploads/clip.mp4",
            max_frames=12,
            scene_threshold=0.25,
        )
    )
    analyze = await use_cases.start_shot_analysis(
        StartCreativeCanvasShotAnalysisCommand(
            context=context,
            project_dir=project_dir,
            frame_urls=(
                "freezone/_uploads/frame-a.png",
                "freezone/_uploads/frame-b.png",
            ),
            analysis_mode="video_story",
            duration_sec=15.0,
        )
    )
    story = await use_cases.start_video_story_analysis(
        StartCreativeCanvasVideoStoryAnalysisCommand(
            context=context,
            project_dir=project_dir,
            video_url="freezone/_uploads/clip.mp4",
            max_frames=20,
            scene_threshold=0.3,
            duration_sec=None,
        )
    )
    upscale = await use_cases.start_video_upscale(
        StartCreativeCanvasVideoUpscaleCommand(
            context=context,
            project_dir=project_dir,
            source_url="freezone/_uploads/clip.mp4",
            resolution="2k",
            frame_interpolation="none",
            denoise_strength="2x",
        )
    )

    assert extract == _receipt(CREATIVE_CANVAS_FRAME_EXTRACTION_TASK_TYPE, "job-extract")
    assert analyze == _receipt(CREATIVE_CANVAS_SHOT_ANALYSIS_TASK_TYPE, "job-analyze")
    assert story == _receipt(CREATIVE_CANVAS_VIDEO_STORY_TASK_TYPE, "job-story")
    assert upscale == _receipt(CREATIVE_CANVAS_VIDEO_UPSCALE_TASK_TYPE, "job-upscale")
    assert scheduler.tasks == [
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_FRAME_EXTRACTION_TASK_TYPE,
            queue_kind="ffmpeg",
            job_id="job-extract",
            project_dir=project_dir,
            payload={
                "video_path": video.as_posix(),
                "max_frames": 12,
                "scene_threshold": 0.25,
            },
        ),
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_SHOT_ANALYSIS_TASK_TYPE,
            queue_kind="default",
            job_id="job-analyze",
            project_dir=project_dir,
            payload={
                "frame_paths": [str(frame_a), str(frame_b)],
                "analysis_mode": "video_story",
                "duration_sec": 15.0,
            },
        ),
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_VIDEO_STORY_TASK_TYPE,
            queue_kind="ffmpeg",
            job_id="job-story",
            project_dir=project_dir,
            payload={
                "video_path": video.as_posix(),
                "max_frames": 20,
                "scene_threshold": 0.3,
                "duration_sec": None,
            },
        ),
        CreativeCanvasTaskSubmission(
            task_type=CREATIVE_CANVAS_VIDEO_UPSCALE_TASK_TYPE,
            queue_kind="ffmpeg",
            job_id="job-upscale",
            project_dir=project_dir,
            payload={
                "source_path": video.as_posix(),
                "resolution": "2k",
                "frame_interpolation": "none",
                "denoise_strength": "2x",
            },
        ),
    ]


@pytest.mark.asyncio
async def test_video_processing_preserves_source_error_contracts(tmp_path: Path) -> None:
    context = _project_context(tmp_path)
    scheduler = _CapturingScheduler(context)
    use_cases = CreativeCanvasVideoProcessingUseCases(
        ProjectCreativeCanvasMediaSourceResolver(),
        _FixedJobIds("unused"),
        scheduler,
    )

    with pytest.raises(
        InvalidCreativeCanvasVideoProcessingRequest,
        match="url resolves outside project",
    ):
        await use_cases.start_frame_extraction(
            StartCreativeCanvasFrameExtractionCommand(
                context=context,
                project_dir=context.output_dir,
                video_url="../outside.mp4",
                max_frames=20,
                scene_threshold=0.3,
            )
        )

    with pytest.raises(
        CreativeCanvasVideoProcessingSourceMissing,
        match="video not found: ",
    ) as video_exc:
        await use_cases.start_frame_extraction(
            StartCreativeCanvasFrameExtractionCommand(
                context=context,
                project_dir=context.output_dir,
                video_url="freezone/_uploads/missing.mp4",
                max_frames=20,
                scene_threshold=0.3,
            )
        )
    assert video_exc.value.field_name == "video"

    with pytest.raises(
        CreativeCanvasVideoProcessingSourceMissing,
        match="video source not found: ",
    ) as upscale_exc:
        await use_cases.start_video_upscale(
            StartCreativeCanvasVideoUpscaleCommand(
                context=context,
                project_dir=context.output_dir,
                source_url="freezone/_uploads/missing.mp4",
                resolution="1080p",
                frame_interpolation="none",
                denoise_strength="1x",
            )
        )
    assert upscale_exc.value.field_name == "video source"

    with pytest.raises(
        InvalidCreativeCanvasVideoProcessingRequest,
        match=r"frame_urls is required \(non-empty\)",
    ):
        await use_cases.start_shot_analysis(
            StartCreativeCanvasShotAnalysisCommand(
                context=context,
                project_dir=context.output_dir,
                frame_urls=(),
                analysis_mode="shots",
            )
        )

    with pytest.raises(
        CreativeCanvasVideoProcessingSourceMissing,
        match="frame not found: ",
    ) as frame_exc:
        await use_cases.start_shot_analysis(
            StartCreativeCanvasShotAnalysisCommand(
                context=context,
                project_dir=context.output_dir,
                frame_urls=("freezone/_uploads/missing.png",),
                analysis_mode="shots",
            )
        )
    assert frame_exc.value.field_name == "frame"
    assert scheduler.tasks == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (
            InvalidCreativeCanvasVideoProcessingRequest("invalid video"),
            400,
            "invalid video",
        ),
        (
            CreativeCanvasVideoProcessingSourceMissing(
                Path("missing.mp4"),
                field_name="video",
            ),
            404,
            "video not found: missing.mp4",
        ),
    ],
)
async def test_video_processing_route_preserves_error_contracts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
    status_code: int,
    detail: str,
) -> None:
    context = _project_context(tmp_path)

    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class FailingUseCases:
        async def start_frame_extraction(self, _command):
            raise failure

    monkeypatch.setattr(
        video_processing_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        video_processing_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(HTTPException) as exc:
        await video_processing_routes.freezone_extract_frames(
            project="project-1",
            body=FreezoneExtractFramesRequest(video_url="video.mp4"),
            user={"username": "alice"},
        )

    assert exc.value.status_code == status_code
    assert exc.value.detail == detail


@pytest.mark.asyncio
async def test_video_processing_route_preserves_runtime_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _project_context(tmp_path)

    async def fake_resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(ctx=context, project_dir=context.output_dir)

    class FailingUseCases:
        async def start_frame_extraction(self, _command):
            raise RuntimeError("broker unavailable")

    monkeypatch.setattr(
        video_processing_routes,
        "resolve_project_scope",
        fake_resolve_project_scope,
    )
    monkeypatch.setattr(
        video_processing_routes,
        "creative_canvas_video_processing_use_cases",
        lambda: FailingUseCases(),
    )

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await video_processing_routes.freezone_extract_frames(
            project="project-1",
            body=FreezoneExtractFramesRequest(video_url="video.mp4"),
            user={"username": "alice"},
        )

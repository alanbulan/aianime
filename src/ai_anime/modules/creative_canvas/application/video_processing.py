"""Creative Canvas video processing application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.video_processing import (
    CreativeCanvasVideoEraseMode,
    validate_video_erase_box,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_FRAME_EXTRACTION_TASK_TYPE = "freezone_extract"
CREATIVE_CANVAS_SHOT_ANALYSIS_TASK_TYPE = "freezone_analyze"
CREATIVE_CANVAS_VIDEO_STORY_TASK_TYPE = "freezone_video_story"
CREATIVE_CANVAS_VIDEO_ERASE_TASK_TYPE = "freezone_video_erase"
CREATIVE_CANVAS_VIDEO_UPSCALE_TASK_TYPE = "freezone_video_upscale"
CREATIVE_CANVAS_AUDIO_SEPARATION_TASK_TYPE = "freezone_audio_separate"
CreativeCanvasShotAnalysisMode = Literal["shots", "video_story"]


class InvalidCreativeCanvasVideoProcessingRequest(ValueError):
    pass


class CreativeCanvasVideoProcessingSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path, *, field_name: str) -> None:
        self.source_path = source_path
        self.field_name = field_name
        super().__init__(f"{field_name} not found: {source_path}")


@dataclass(frozen=True)
class StartCreativeCanvasFrameExtractionCommand:
    context: ProjectContext
    project_dir: Path
    video_url: str
    max_frames: int
    scene_threshold: float


@dataclass(frozen=True)
class StartCreativeCanvasShotAnalysisCommand:
    context: ProjectContext
    project_dir: Path
    frame_urls: tuple[str, ...]
    analysis_mode: CreativeCanvasShotAnalysisMode
    duration_sec: float | None = None


@dataclass(frozen=True)
class StartCreativeCanvasVideoStoryAnalysisCommand:
    context: ProjectContext
    project_dir: Path
    video_url: str
    max_frames: int
    scene_threshold: float
    duration_sec: float | None = None


@dataclass(frozen=True)
class StartCreativeCanvasVideoUpscaleCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    resolution: str
    frame_interpolation: str
    denoise_strength: str


@dataclass(frozen=True)
class StartCreativeCanvasVideoEraseCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    mode: CreativeCanvasVideoEraseMode
    box_x: float | None = None
    box_y: float | None = None
    box_width: float | None = None
    box_height: float | None = None


@dataclass(frozen=True)
class StartCreativeCanvasAudioSeparationCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    target_episode: int | None = None
    target_beat: int | None = None


class CreativeCanvasVideoProcessingUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_frame_extraction(
        self,
        command: StartCreativeCanvasFrameExtractionCommand,
    ) -> CreativeCanvasTaskReceipt:
        video_path = self._resolve_existing_source(
            command.project_dir,
            command.video_url,
            field_name="video",
        )
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_FRAME_EXTRACTION_TASK_TYPE,
            queue_kind="ffmpeg",
            payload={
                "video_path": video_path.as_posix(),
                "max_frames": command.max_frames,
                "scene_threshold": command.scene_threshold,
            },
        )

    async def start_shot_analysis(
        self,
        command: StartCreativeCanvasShotAnalysisCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.frame_urls:
            raise InvalidCreativeCanvasVideoProcessingRequest(
                "frame_urls is required (non-empty)"
            )
        frame_paths = [
            self._resolve_existing_source(
                command.project_dir,
                frame_url,
                field_name="frame",
            )
            for frame_url in command.frame_urls
        ]
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_SHOT_ANALYSIS_TASK_TYPE,
            queue_kind="default",
            payload={
                "frame_paths": [str(path) for path in frame_paths],
                "analysis_mode": command.analysis_mode,
                "duration_sec": command.duration_sec,
            },
        )

    async def start_video_story_analysis(
        self,
        command: StartCreativeCanvasVideoStoryAnalysisCommand,
    ) -> CreativeCanvasTaskReceipt:
        video_path = self._resolve_existing_source(
            command.project_dir,
            command.video_url,
            field_name="video",
        )
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_VIDEO_STORY_TASK_TYPE,
            queue_kind="ffmpeg",
            payload={
                "video_path": video_path.as_posix(),
                "max_frames": command.max_frames,
                "scene_threshold": command.scene_threshold,
                "duration_sec": command.duration_sec,
            },
        )

    async def start_video_upscale(
        self,
        command: StartCreativeCanvasVideoUpscaleCommand,
    ) -> CreativeCanvasTaskReceipt:
        source_path = self._resolve_existing_source(
            command.project_dir,
            command.source_url,
            field_name="video source",
        )
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_VIDEO_UPSCALE_TASK_TYPE,
            queue_kind="ffmpeg",
            payload={
                "source_path": source_path.as_posix(),
                "resolution": command.resolution,
                "frame_interpolation": command.frame_interpolation,
                "denoise_strength": command.denoise_strength,
            },
        )

    async def start_video_erase(
        self,
        command: StartCreativeCanvasVideoEraseCommand,
    ) -> CreativeCanvasTaskReceipt:
        source_path = self._resolve_existing_source(
            command.project_dir,
            command.source_url,
            field_name="video source",
        )
        try:
            validate_video_erase_box(
                command.mode,
                box_x=command.box_x,
                box_y=command.box_y,
                box_width=command.box_width,
                box_height=command.box_height,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoProcessingRequest(str(exc)) from exc
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_VIDEO_ERASE_TASK_TYPE,
            queue_kind="ffmpeg",
            payload={
                "source_path": source_path.as_posix(),
                "mode": command.mode,
                "box_x": command.box_x,
                "box_y": command.box_y,
                "box_width": command.box_width,
                "box_height": command.box_height,
            },
        )

    async def start_audio_separation(
        self,
        command: StartCreativeCanvasAudioSeparationCommand,
    ) -> CreativeCanvasTaskReceipt:
        source_path = self._resolve_existing_source(
            command.project_dir,
            command.source_url,
            field_name="video source",
        )
        return await self._enqueue(
            context=command.context,
            project_dir=command.project_dir,
            task_type=CREATIVE_CANVAS_AUDIO_SEPARATION_TASK_TYPE,
            queue_kind="ffmpeg",
            payload={
                "source_path": source_path.as_posix(),
                "target_episode": command.target_episode,
                "target_beat": command.target_beat,
            },
        )

    async def _enqueue(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        task_type: str,
        queue_kind: str,
        payload: dict[str, object],
    ) -> CreativeCanvasTaskReceipt:
        return await self._scheduler.enqueue(
            context,
            CreativeCanvasTaskSubmission(
                task_type=task_type,
                queue_kind=queue_kind,
                job_id=self._job_ids.new_id(),
                project_dir=project_dir,
                payload=payload,
            ),
        )

    def _resolve_existing_source(
        self,
        project_dir: Path,
        source_url: str,
        *,
        field_name: str,
    ) -> Path:
        try:
            source_path = self._sources.resolve(project_dir, source_url)
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoProcessingRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasVideoProcessingSourceMissing(
                source_path,
                field_name=field_name,
            )
        return source_path

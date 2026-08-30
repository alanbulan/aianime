"""Creative Canvas background-job execution contracts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from ai_anime.modules.creative_canvas.application.job_workspace import (
    CreativeCanvasJobWorkspace,
)


@dataclass(frozen=True)
class GenerateCreativeCanvasImageJobCommand:
    project_dir: Path
    job_id: str
    prompt: str
    aspect_ratio: str = "1:1"
    image_size: str = "2K"
    reference_paths: tuple[str, ...] = ()
    model: str | None = None
    model_selector: str | None = None
    extra_params: Mapping[str, object] | None = None
    quality: str | None = None
    output_task_type: str = "freezone_gen"


@dataclass(frozen=True)
class EditCreativeCanvasImageJobCommand:
    project_dir: Path
    job_id: str
    prompt: str
    base_path: str
    extra_reference_paths: tuple[str, ...] = ()
    aspect_ratio: str = "2:3"
    image_size: str = "2K"
    model: str | None = None
    model_selector: str | None = None
    extra_params: Mapping[str, object] | None = None
    quality: str | None = None
    output_task_type: str = "freezone_edit"


@dataclass(frozen=True)
class MaskEditCreativeCanvasImageJobCommand:
    project_dir: Path
    job_id: str
    base_path: str
    mask_path: str
    prompt: str
    aspect_ratio: str = "1:1"
    image_size: str = "2K"
    quality: str = "medium"
    model: str | None = None
    model_selector: str | None = None


@dataclass(frozen=True)
class UpscaleCreativeCanvasVideoJobCommand:
    project_dir: Path
    job_id: str
    source_path: str
    resolution: str = "1080p"
    frame_interpolation: str = "none"
    denoise_strength: str = "1x"


@dataclass(frozen=True)
class ComposeCreativeCanvasVideoJobCommand:
    project_dir: Path
    job_id: str
    tracks: tuple[Mapping[str, Any], ...]
    title: str = ""
    canvas_id: str = ""
    resolution: str = "1080p"
    fps: int = 30
    background_color: str = "#000000"
    keep_original_audio: bool = True


@dataclass(frozen=True)
class EraseCreativeCanvasVideoJobCommand:
    project_dir: Path
    job_id: str
    source_path: str
    mode: str
    box_x: float | None = None
    box_y: float | None = None
    box_width: float | None = None
    box_height: float | None = None


@dataclass(frozen=True)
class SeparateCreativeCanvasAudioJobCommand:
    project_dir: Path
    job_id: str
    source_path: str


@dataclass(frozen=True)
class GenerateCreativeCanvasVideoJobCommand:
    project_dir: Path
    job_id: str
    prompt: str
    model: str
    model_role: str
    model_selector: str | None = None
    reference_items: tuple[Mapping[str, str], ...] = ()
    aspect_ratio: str = "16:9"
    resolution: str = "720p"
    duration_seconds: int = 5
    generate_audio: bool = False
    human_review: bool = False
    scene_optimize: str | None = None
    extra_params: Mapping[str, object] | None = None
    last_frame_path: str | None = None
    audio_setting: str | None = None


@dataclass(frozen=True)
class ExtractCreativeCanvasFramesJobCommand:
    project_dir: Path
    job_id: str
    video_path: Path
    max_frames: int = 20
    scene_threshold: float = 0.3


@dataclass(frozen=True)
class AnalyzeCreativeCanvasShotsJobCommand:
    project_dir: Path
    job_id: str
    frame_paths: tuple[str, ...]
    model: str | None = None
    analysis_mode: str = "shots"
    duration_sec: float | None = None


class CreativeCanvasImageJobRuntime(Protocol):
    async def generate(
        self,
        command: GenerateCreativeCanvasImageJobCommand,
    ) -> Path: ...

    async def edit(
        self,
        command: EditCreativeCanvasImageJobCommand,
    ) -> Path: ...

    async def mask_edit(
        self,
        command: MaskEditCreativeCanvasImageJobCommand,
    ) -> Path: ...


class CreativeCanvasVideoProcessingJobRuntime(Protocol):
    async def upscale(
        self,
        command: UpscaleCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, object]]: ...

    async def separate_audio(
        self,
        command: SeparateCreativeCanvasAudioJobCommand,
    ) -> dict[str, Path | None]: ...


class CreativeCanvasVideoCompositionJobRuntime(Protocol):
    async def compose(
        self,
        command: ComposeCreativeCanvasVideoJobCommand,
    ) -> Path: ...


class CreativeCanvasVideoEraseJobRuntime(Protocol):
    async def erase(
        self,
        command: EraseCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, int | str]]: ...


class CreativeCanvasVideoGenerationJobRuntime(Protocol):
    async def generate(
        self,
        command: GenerateCreativeCanvasVideoJobCommand,
    ) -> Path: ...


class CreativeCanvasVideoAnalysisJobRuntime(Protocol):
    async def extract_frames(
        self,
        command: ExtractCreativeCanvasFramesJobCommand,
    ) -> list[Path]: ...

    async def analyze_shots(
        self,
        command: AnalyzeCreativeCanvasShotsJobCommand,
    ) -> dict[str, object]: ...


class CreativeCanvasJobExecutionUseCases:
    def __init__(
        self,
        workspace: CreativeCanvasJobWorkspace,
        images: CreativeCanvasImageJobRuntime,
        video_processing: CreativeCanvasVideoProcessingJobRuntime,
        video_composition: CreativeCanvasVideoCompositionJobRuntime,
        video_erase: CreativeCanvasVideoEraseJobRuntime,
        video_generation: CreativeCanvasVideoGenerationJobRuntime,
        video_analysis: CreativeCanvasVideoAnalysisJobRuntime,
    ) -> None:
        self._workspace = workspace
        self._images = images
        self._video_processing = video_processing
        self._video_composition = video_composition
        self._video_erase = video_erase
        self._video_generation = video_generation
        self._video_analysis = video_analysis

    async def generate_image(
        self,
        command: GenerateCreativeCanvasImageJobCommand,
    ) -> Path:
        self._workspace.initialize(command.project_dir)
        return await self._images.generate(command)

    async def edit_image(
        self,
        command: EditCreativeCanvasImageJobCommand,
    ) -> Path:
        self._workspace.initialize(command.project_dir)
        return await self._images.edit(command)

    async def mask_edit_image(
        self,
        command: MaskEditCreativeCanvasImageJobCommand,
    ) -> Path:
        self._workspace.initialize(command.project_dir)
        return await self._images.mask_edit(command)

    async def upscale_video(
        self,
        command: UpscaleCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, object]]:
        self._workspace.initialize(command.project_dir)
        return await self._video_processing.upscale(command)

    async def compose_video(
        self,
        command: ComposeCreativeCanvasVideoJobCommand,
    ) -> Path:
        self._workspace.initialize(command.project_dir)
        return await self._video_composition.compose(command)

    async def erase_video(
        self,
        command: EraseCreativeCanvasVideoJobCommand,
    ) -> tuple[Path, dict[str, int | str]]:
        self._workspace.initialize(command.project_dir)
        return await self._video_erase.erase(command)

    async def separate_audio(
        self,
        command: SeparateCreativeCanvasAudioJobCommand,
    ) -> dict[str, Path | None]:
        self._workspace.initialize(command.project_dir)
        return await self._video_processing.separate_audio(command)

    async def generate_video(
        self,
        command: GenerateCreativeCanvasVideoJobCommand,
    ) -> Path:
        self._workspace.initialize(command.project_dir)
        return await self._video_generation.generate(command)

    async def extract_frames(
        self,
        command: ExtractCreativeCanvasFramesJobCommand,
    ) -> list[Path]:
        self._workspace.initialize(command.project_dir)
        return await self._video_analysis.extract_frames(command)

    async def analyze_shots(
        self,
        command: AnalyzeCreativeCanvasShotsJobCommand,
    ) -> dict[str, object]:
        self._workspace.initialize(command.project_dir)
        return await self._video_analysis.analyze_shots(command)

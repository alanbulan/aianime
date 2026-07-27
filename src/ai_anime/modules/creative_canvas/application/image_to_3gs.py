"""Creative Canvas image-to-3GS application use case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_to_3gs import (
    CreativeCanvasImageToThreeGsSourceKind,
    InvalidCreativeCanvasImageToThreeGsSource,
    plan_image_to_three_gs,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_IMAGE_TO_THREE_GS_TASK_TYPE = "freezone_image_to_3gs"


class InvalidCreativeCanvasImageToThreeGsRequest(ValueError):
    pass


class CreativeCanvasImageToThreeGsSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        super().__init__(f"source not found: {source_path}")


@dataclass(frozen=True)
class StartCreativeCanvasImageToThreeGsCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    source_kind: CreativeCanvasImageToThreeGsSourceKind
    canvas_id: str | None = None
    node_id: str | None = None


@dataclass(frozen=True)
class CreativeCanvasImageToThreeGsResult:
    receipt: CreativeCanvasTaskReceipt
    scope: str
    scene_id: str
    step: str


class CreativeCanvasImageToThreeGsUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start(
        self,
        command: StartCreativeCanvasImageToThreeGsCommand,
    ) -> CreativeCanvasImageToThreeGsResult:
        try:
            source_path = self._sources.resolve(
                command.project_dir,
                command.source_url,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasImageToThreeGsRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasImageToThreeGsSourceMissing(source_path)
        try:
            plan = plan_image_to_three_gs(
                source_path=source_path,
                project_dir=command.project_dir,
                source_url=command.source_url,
                source_kind=command.source_kind,
            )
        except InvalidCreativeCanvasImageToThreeGsSource as exc:
            raise InvalidCreativeCanvasImageToThreeGsRequest(str(exc)) from exc

        job_id = self._job_ids.new_id()
        receipt = await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_TO_THREE_GS_TASK_TYPE,
                queue_kind="world",
                job_id=job_id,
                project_dir=command.project_dir,
                payload={
                    "scene_id": plan.scene_id,
                    "source_path": source_path.as_posix(),
                    "source_kind": plan.source_kind,
                    "params": plan.params,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                },
            ),
        )
        return CreativeCanvasImageToThreeGsResult(
            receipt=receipt,
            scope=job_id,
            scene_id=plan.scene_id,
            step=plan.step,
        )

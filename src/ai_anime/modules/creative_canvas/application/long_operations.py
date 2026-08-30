"""Queued Creative Canvas model operations without media job artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasMarkSelection
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class StartCreativeCanvasMarkDetectionCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    selection: CreativeCanvasMarkSelection


@dataclass(frozen=True)
class StartCreativeCanvasStagingPropCommand:
    context: ProjectContext
    project_dir: Path
    request: dict[str, object]


class CreativeCanvasLongOperationUseCases:
    def __init__(
        self,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_mark_detection(
        self,
        command: StartCreativeCanvasMarkDetectionCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.source_url.strip():
            raise ValueError("source_url is required")
        command.selection.require_target()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="freezone_mark_detect",
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "source_url": command.source_url,
                    "selection": {
                        "point_x": command.selection.point_x,
                        "point_y": command.selection.point_y,
                        "box_x": command.selection.box_x,
                        "box_y": command.selection.box_y,
                        "box_width": command.selection.box_width,
                        "box_height": command.selection.box_height,
                    },
                    "display_name": "识别图片局部标记",
                },
            ),
        )

    async def start_staging_prop(
        self,
        command: StartCreativeCanvasStagingPropCommand,
    ) -> CreativeCanvasTaskReceipt:
        request: dict[str, Any] = dict(command.request)
        request.pop("api_key", None)
        request.pop("base_url", None)
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="freezone_ai_staging_prop",
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                scope="ai_staging",
                payload={
                    "request": request,
                    "display_name": "生成 AI 布景道具",
                },
            ),
        )


__all__ = [
    "CreativeCanvasLongOperationUseCases",
    "StartCreativeCanvasMarkDetectionCommand",
    "StartCreativeCanvasStagingPropCommand",
]

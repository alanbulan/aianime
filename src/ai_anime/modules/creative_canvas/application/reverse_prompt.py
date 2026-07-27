"""Creative Canvas image reverse-prompt application use case."""

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
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE = "freezone_image_reverse_prompt"


class InvalidCreativeCanvasReversePromptRequest(ValueError):
    pass


class CreativeCanvasReversePromptSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        super().__init__(f"source not found: {source_path}")


@dataclass(frozen=True)
class StartCreativeCanvasReversePromptCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    canvas_id: str | None = None
    node_id: str | None = None


class CreativeCanvasReversePromptUseCases:
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
        command: StartCreativeCanvasReversePromptCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.source_url:
            raise InvalidCreativeCanvasReversePromptRequest("source_url is required")
        try:
            source_path = self._sources.resolve(
                command.project_dir,
                command.source_url,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasReversePromptRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasReversePromptSourceMissing(source_path)

        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "source_path": source_path.as_posix(),
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                },
            ),
        )

from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.application.long_operations import (
    CreativeCanvasLongOperationUseCases,
    StartCreativeCanvasMarkDetectionCommand,
    StartCreativeCanvasStagingPropCommand,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain import CreativeCanvasMarkSelection
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


class _JobIds:
    def __init__(self) -> None:
        self._next = 0

    def new_id(self) -> str:
        self._next += 1
        return f"job-{self._next}"


class _Scheduler:
    def __init__(self) -> None:
        self.tasks: list[CreativeCanvasTaskSubmission] = []

    async def enqueue(
        self,
        _context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        self.tasks.append(task)
        scope = task.scope or task.job_id
        return CreativeCanvasTaskReceipt(
            task_type=task.task_type,
            job_id=task.job_id,
            task_key=f"task:{task.task_type}:{scope}",
            task_episode=task.episode,
            task_scope=scope,
            backend="local",
            queue=None,
            task_id=f"task-{task.job_id}",
        )


@pytest.mark.asyncio
async def test_mark_detection_uses_a_unique_queued_scope(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = CreativeCanvasLongOperationUseCases(_JobIds(), scheduler)
    context = _project_context(tmp_path)

    receipt = await use_cases.start_mark_detection(
        StartCreativeCanvasMarkDetectionCommand(
            context=context,
            project_dir=context.output_dir,
            source_url="freezone/source.png",
            selection=CreativeCanvasMarkSelection(point_x=0.2, point_y=0.3),
        )
    )

    task = scheduler.tasks[0]
    assert task.task_type == "freezone_mark_detect"
    assert task.scope is None
    assert receipt.task_scope == "job-1"
    assert task.payload["source_url"] == "freezone/source.png"


@pytest.mark.asyncio
async def test_ai_staging_uses_the_panel_scope_and_strips_client_secrets(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = CreativeCanvasLongOperationUseCases(_JobIds(), scheduler)
    context = _project_context(tmp_path)

    receipt = await use_cases.start_staging_prop(
        StartCreativeCanvasStagingPropCommand(
            context=context,
            project_dir=context.output_dir,
            request={
                "user_hint": "路边长椅",
                "api_key": "must-not-enter-task-state",
                "base_url": "https://example.invalid/v1",
            },
        )
    )

    task = scheduler.tasks[0]
    assert task.task_type == "freezone_ai_staging_prop"
    assert task.scope == "ai_staging"
    assert receipt.task_scope == "ai_staging"
    assert task.payload["request"] == {"user_hint": "路边长椅"}

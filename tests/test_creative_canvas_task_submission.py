from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.infrastructure.task_submission import (
    TaskBackendCreativeCanvasTaskScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_backend.limits import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)


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


def _task(tmp_path: Path) -> CreativeCanvasTaskSubmission:
    return CreativeCanvasTaskSubmission(
        task_type="freezone_image_reverse_prompt",
        queue_kind="default",
        job_id="job-1",
        project_dir=tmp_path / "output",
        payload={
            "source_path": (tmp_path / "output" / "source.png").as_posix(),
            "canvas_id": "canvas-1",
            "node_id": "node-1",
        },
    )


@pytest.mark.asyncio
async def test_task_backend_scheduler_preserves_payload_and_receipt(
    tmp_path: Path,
) -> None:
    context = _project_context(tmp_path)
    task = _task(tmp_path)
    captured: dict[str, object] = {}

    class FakeBackend:
        async def enqueue_project_task(self, received_context, **kwargs):
            assert received_context is context
            captured.update(kwargs)
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="node.local.default",
            )

    result = await TaskBackendCreativeCanvasTaskScheduler(
        lambda: FakeBackend()
    ).enqueue(context, task)

    assert captured == {
        "task_type": "freezone_image_reverse_prompt",
        "queue_kind": "default",
        "episode": 0,
        "scope": "job-1",
        "payload": {
            **task.payload,
            "job_id": "job-1",
            "project_dir": str(task.project_dir),
        },
    }
    assert result.task_type == "freezone_image_reverse_prompt"
    assert result.job_id == "job-1"
    assert (
        result.task_key
        == "task:freezone_image_reverse_prompt:project:project-1:0:job-1"
    )
    assert result.task_episode == 0
    assert result.task_scope == "job-1"
    assert result.backend == "celery"
    assert result.queue == "node.local.default"
    assert result.task_id == "task-1"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        ProjectTaskLimitExceeded(
            project_id="project-1",
            queue_kind="default",
            limit=2,
            active=2,
        ),
        ProjectUserTaskLimitExceeded(
            project_id="project-1",
            requester_user_id="user-1",
            queue_kind="default",
            limit=1,
            active=1,
        ),
    ],
)
async def test_task_backend_scheduler_preserves_limit_errors(
    tmp_path: Path,
    failure: RuntimeError,
) -> None:
    class FailingBackend:
        async def enqueue_project_task(self, *_args, **_kwargs):
            raise failure

    scheduler = TaskBackendCreativeCanvasTaskScheduler(lambda: FailingBackend())

    with pytest.raises(type(failure)) as exc:
        await scheduler.enqueue(_project_context(tmp_path), _task(tmp_path))
    assert exc.value is failure


@pytest.mark.asyncio
async def test_task_backend_scheduler_maps_runtime_failure(tmp_path: Path) -> None:
    class FailingBackend:
        async def enqueue_project_task(self, *_args, **_kwargs):
            raise RuntimeError("broker unavailable")

    with pytest.raises(CreativeCanvasTaskStartFailed, match="broker unavailable"):
        await TaskBackendCreativeCanvasTaskScheduler(
            lambda: FailingBackend()
        ).enqueue(_project_context(tmp_path), _task(tmp_path))


@pytest.mark.asyncio
async def test_task_backend_scheduler_can_preserve_runtime_failure(tmp_path: Path) -> None:
    failure = RuntimeError("broker unavailable")

    class FailingBackend:
        async def enqueue_project_task(self, *_args, **_kwargs):
            raise failure

    scheduler = TaskBackendCreativeCanvasTaskScheduler(
        lambda: FailingBackend(),
        translate_runtime_errors=False,
    )

    with pytest.raises(RuntimeError) as exc:
        await scheduler.enqueue(_project_context(tmp_path), _task(tmp_path))
    assert exc.value is failure

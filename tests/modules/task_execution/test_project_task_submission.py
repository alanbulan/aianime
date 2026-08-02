from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.task_execution.application.ports import QueuedTask
from ai_anime.modules.task_execution.application.project_task_submission import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class FakeTaskBackend:
    def __init__(self) -> None:
        self.calls: list[tuple[object, dict[str, object]]] = []

    async def enqueue_project_task(self, context, **kwargs):
        self.calls.append((context, kwargs))
        return QueuedTask(
            task_state=SimpleNamespace(task_id="task-1"),
            backend="celery",
            queue="node.local.video",
        )


@pytest.mark.asyncio
async def test_project_task_submission_owns_backend_call_and_stable_receipt() -> None:
    backend = FakeTaskBackend()
    context = SimpleNamespace(project_id="project-1")
    use_cases = ProjectTaskSubmissionUseCases(lambda: backend)

    receipt = await use_cases.submit(
        context,
        ProjectTaskSubmission(
            task_type="single_video",
            queue_kind="video",
            episode=2,
            beat_num=3,
            scope="attempt-1",
            payload={"model": "cloud-video-standard"},
        ),
    )

    assert backend.calls == [
        (
            context,
            {
                "task_type": "single_video",
                "queue_kind": "video",
                "episode": 2,
                "beat_num": 3,
                "scope": "attempt-1",
                "payload": {"model": "cloud-video-standard"},
            },
        )
    ]
    assert receipt.task_id == "task-1"
    assert receipt.task_key == (
        "task:single_video:project:project-1:2:3:attempt-1"
    )
    assert receipt.backend == "celery"
    assert receipt.queue == "node.local.video"


@pytest.mark.asyncio
async def test_project_task_submission_omits_absent_optional_identity_fields() -> None:
    backend = FakeTaskBackend()
    context = SimpleNamespace(project_id="project-1")

    receipt = await ProjectTaskSubmissionUseCases(lambda: backend).submit(
        context,
        ProjectTaskSubmission(
            task_type="build_scenes",
            payload={"output_dir": "output"},
        ),
    )

    assert backend.calls == [
        (
            context,
            {
                "task_type": "build_scenes",
                "queue_kind": "default",
                "episode": 0,
                "payload": {"output_dir": "output"},
            },
        )
    ]
    assert receipt.task_key == "task:build_scenes:project:project-1:0"

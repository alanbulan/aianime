from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.director_control_sketch import (
    DirectorControlFrameStatus,
    DirectorControlSketchTaskReceipt,
    DirectorControlSketchUnavailable,
    DirectorControlSketchUseCases,
    GenerateDirectorControlSketchCommand,
)


class _FrameSource:
    def __init__(self, status: DirectorControlFrameStatus) -> None:
        self.status_result = status
        self.calls = []

    def status(self, context, episode_num: int, beat_num: int):
        self.calls.append((context, episode_num, beat_num))
        return self.status_result


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        return DirectorControlSketchTaskReceipt(
            task_id="task-1",
            task_key=(
                "task:sketch_generation:project:proj-1:2:3:"
                "director_control_to_sketch:ep002:beat_03"
            ),
            backend="celery",
            queue="default",
        )


def _status(*, ready: bool) -> DirectorControlFrameStatus:
    data = {
        "episode": 2,
        "beat_num": 3,
        "ready": ready,
        "path": "/project/director_control_frames/ep002/beat_03/combined.png",
        "rel_path": (
            "director_control_frames/ep002/beat_03/combined.png"
            if ready
            else None
        ),
        "url": (
            "/static/projects/proj-1/"
            "director_control_frames/ep002/beat_03/combined.png"
            if ready
            else None
        ),
        "scope": "director_control_to_sketch:ep002:beat_03",
    }
    return DirectorControlFrameStatus(
        ready=ready,
        scope=data["scope"],
        data=data,
    )


@pytest.mark.asyncio
async def test_generate_director_control_sketch_schedules_existing_frame(
    tmp_path: Path,
) -> None:
    context = SimpleNamespace(
        project_id="proj-1",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
    )
    frame_source = _FrameSource(_status(ready=True))
    scheduler = _Scheduler()

    scheduled = await DirectorControlSketchUseCases(
        frame_source,
        scheduler,
    ).generate(
        context,
        GenerateDirectorControlSketchCommand(
            episode_num=2,
            beat_num=3,
            model="sketch-image-sku",
        ),
    )

    assert frame_source.calls == [(context, 2, 3)]
    assert len(scheduler.calls) == 1
    target_context, task = scheduler.calls[0]
    assert target_context is context
    assert task.backend_payload() == {
        "task_kind": "director_control_to_sketch",
        "episode": 2,
        "beat_num": 3,
        "output_dir": str(tmp_path),
        "state_dir": str(tmp_path / "state"),
        "model": "sketch-image-sku",
    }
    assert scheduled.as_dict() == {
        "task_type": "sketch_generation",
        "scope": "director_control_to_sketch:ep002:beat_03",
        "task_id": "task-1",
        "task_key": (
            "task:sketch_generation:project:proj-1:2:3:"
            "director_control_to_sketch:ep002:beat_03"
        ),
        "backend": "celery",
        "queue": "default",
        "message": "Beat 3 Direct Render 转草图任务已进入队列",
        "data": frame_source.status_result.data,
    }


@pytest.mark.asyncio
async def test_generate_director_control_sketch_rejects_missing_frame() -> None:
    context = SimpleNamespace(output_dir="/project", state_dir="/state")
    status = _status(ready=False)
    scheduler = _Scheduler()

    with pytest.raises(
        DirectorControlSketchUnavailable,
        match="Beat 3 缺少 Direct Render combined.png",
    ) as exc_info:
        await DirectorControlSketchUseCases(
            _FrameSource(status),
            scheduler,
        ).generate(
            context,
            GenerateDirectorControlSketchCommand(
                episode_num=2,
                beat_num=3,
                model="sketch-image-sku",
            ),
        )

    assert exc_info.value.status is status
    assert scheduler.calls == []

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.director_control_sketch import (
    DirectorControlSketchTask,
)
from ai_anime.modules.production.infrastructure.director_control_sketch import (
    AssetWorldDirectorControlFrameSource,
    TaskBackendDirectorControlSketchScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_asset_world_frame_source_projects_canonical_control_frame(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path)
    frame = (
        tmp_path
        / "director_control_frames"
        / "ep002"
        / "beat_03"
        / "combined.png"
    )
    frame.parent.mkdir(parents=True)
    frame.write_bytes(b"png")

    status = AssetWorldDirectorControlFrameSource().status(context, 2, 3)

    assert status.ready is True
    assert status.scope == "director_control_to_sketch:ep002:beat_03"
    assert status.data["path"] == frame.as_posix()
    assert status.data["rel_path"] == (
        "director_control_frames/ep002/beat_03/combined.png"
    )
    assert status.data["url"].startswith(
        "/static/projects/proj-1/"
        "director_control_frames/ep002/beat_03/combined.png?v="
    )


@pytest.mark.asyncio
async def test_task_backend_scheduler_preserves_director_control_contract(
    tmp_path: Path,
) -> None:
    calls = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="default",
            )

    context = _context(tmp_path)
    task = DirectorControlSketchTask(
        episode_num=2,
        beat_num=3,
        scope="director_control_to_sketch:ep002:beat_03",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
    )

    receipt = await TaskBackendDirectorControlSketchScheduler(
        lambda: Backend()
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "sketch_generation",
                "queue_kind": "default",
                "episode": 2,
                "beat_num": 3,
                "scope": "director_control_to_sketch:ep002:beat_03",
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.task_id == "task-1"
    assert receipt.task_key == (
        "task:sketch_generation:project:proj-1:2:3:"
        "director_control_to_sketch:ep002:beat_03"
    )
    assert receipt.backend == "celery"
    assert receipt.queue == "default"

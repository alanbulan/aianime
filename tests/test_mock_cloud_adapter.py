from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from ai_anime.ports.cloud import CloudTaskRequest
from ai_anime.ports.local.mock_cloud import MockCloudAdapter, cloud_task_kind
from ai_anime.ports.local.mock_tasks import MockCloudTaskBackend
from ai_anime.project_context import ProjectContext
from ai_anime.task_state import get_task_manager


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-mock",
        project_name="Mock Project",
        owner_type="user",
        owner_id="user-1",
        owner_username="owner",
        requester_user_id="user-1",
        requester_username="owner",
        requester_principals=(("user", "user-1"),),
        effective_role="owner",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.parametrize(
    ("task_type", "expected"),
    [
        ("script_writer", "text"),
        ("character_portrait", "image"),
        ("single_video", "video"),
        ("audio_generation", "audio"),
        ("build_episodes", "story"),
    ],
)
def test_cloud_task_kind_covers_desktop_generation_families(
    task_type: str, expected: str
) -> None:
    assert cloud_task_kind(task_type) == expected


@pytest.mark.asyncio
async def test_mock_adapter_returns_deterministic_image_artifact(tmp_path: Path) -> None:
    request = CloudTaskRequest(
        task_id="task-123",
        task_type="character_portrait",
        kind="image",
        project_id="project-mock",
        episode=1,
        beat_num=None,
        scope=None,
        payload={"prompt": "hero portrait"},
        output_dir=tmp_path,
    )
    progress: list[float] = []
    adapter = MockCloudAdapter(step_delay_seconds=0)
    result = await adapter.run_task(
        request,
        report_progress=lambda value, _message: _append_progress(progress, value),
        is_cancelled=lambda: False,
    )

    assert result.provider_task_id == "mock-task-123"
    assert result.kind == "image"
    assert progress == [0.15, 0.45, 0.8]
    assert Path(result.output["image_path"]).is_file()


async def _append_progress(values: list[float], value: float) -> None:
    values.append(value)


async def _wait_for_status(
    ctx: ProjectContext,
    task_type: str,
    status: str,
    *,
    timeout: float = 2.0,
) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        state = get_task_manager().get_task_for_project(ctx, task_type, 1)
        if state and state.status == status:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"task {task_type} did not reach {status}")


@pytest.mark.asyncio
async def test_mock_task_backend_completes_and_retries_with_new_task_id(
    tmp_path: Path,
) -> None:
    ctx = _context(tmp_path)
    backend = MockCloudTaskBackend(MockCloudAdapter(step_delay_seconds=0))

    first = await backend.enqueue_project_task(
        ctx,
        task_type="script_writer",
        episode=1,
        payload={"prompt": "opening"},
    )
    await _wait_for_status(ctx, "script_writer", "completed")
    first_state = get_task_manager().get_task_for_project(ctx, "script_writer", 1)
    assert first_state is not None
    assert first_state.result["provider_task_id"] == f"mock-{first.task_state.task_id}"

    retried = await backend.enqueue_project_task(
        ctx,
        task_type="script_writer",
        episode=1,
        payload={"prompt": "opening"},
    )
    await _wait_for_status(ctx, "script_writer", "completed")
    assert retried.task_state.task_id != first.task_state.task_id


@pytest.mark.asyncio
async def test_mock_task_backend_cancels_active_task(tmp_path: Path) -> None:
    ctx = _context(tmp_path)
    backend = MockCloudTaskBackend(MockCloudAdapter(step_delay_seconds=0.2))
    queued = await backend.enqueue_project_task(
        ctx,
        task_type="audio_generation",
        episode=1,
    )
    await asyncio.sleep(0.02)

    assert await backend.cancel_project_task(ctx, queued.task_state)
    state = get_task_manager().get_task_for_project(ctx, "audio_generation", 1)
    assert state is not None
    assert state.status == "cancelled"

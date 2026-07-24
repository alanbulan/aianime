from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.application.global_video_optimization import (
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationMaterials,
    GlobalVideoOptimizationSketchesMissing,
    GlobalVideoOptimizationTaskReceipt,
    GlobalVideoOptimizationUseCases,
    OptimizeEpisodeVideoCommand,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_video_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id="user_editor",
        requester_username="bob",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


class _Source:
    def __init__(self, materials: GlobalVideoOptimizationMaterials) -> None:
        self.materials = materials

    async def load(self, _context, _episode_num):
        return self.materials


class _Sketches:
    def __init__(self, available: bool) -> None:
        self.available = available

    def has_any(self, _context, _episode_num):
        return self.available


class _Scheduler:
    def __init__(self) -> None:
        self.task = None

    async def enqueue(self, _context, task):
        self.task = task
        return GlobalVideoOptimizationTaskReceipt(
            task_id="task-1",
            task_key="task:global_optimize_video:project:proj_video_123:3",
            backend="celery",
            queue="node.local.default",
        )


def _materials(*, beats=None) -> GlobalVideoOptimizationMaterials:
    return GlobalVideoOptimizationMaterials(
        beats=[{"beat_number": 1}] if beats is None else beats,
        characters=[{"name": "A"}],
    )


@pytest.mark.asyncio
async def test_schedule_builds_backend_task_and_response(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = GlobalVideoOptimizationUseCases(
        _Source(_materials()),
        _Sketches(True),
        scheduler,
    )
    context = _context(tmp_path)

    scheduled = await use_cases.schedule(
        context,
        OptimizeEpisodeVideoCommand(episode_num=3, language="zh"),
    )

    assert scheduler.task.backend_payload() == {
        "episode": 3,
        "beats": [{"beat_number": 1}],
        "characters": [{"name": "A"}],
        "output_dir": str(context.output_dir),
        "language": "zh",
    }
    assert scheduled.as_dict() == {
        "task_type": "global_optimize_video",
        "task_id": "task-1",
        "task_key": "task:global_optimize_video:project:proj_video_123:3",
        "backend": "celery",
        "queue": "node.local.default",
        "message": "第 3 集全局视频优化已进入队列",
    }


@pytest.mark.asyncio
async def test_schedule_rejects_episode_without_beats(tmp_path: Path) -> None:
    use_cases = GlobalVideoOptimizationUseCases(
        _Source(_materials(beats=[])),
        _Sketches(True),
        _Scheduler(),
    )

    with pytest.raises(
        GlobalVideoOptimizationBeatsMissing,
        match="No beats found for episode 3",
    ):
        await use_cases.schedule(
            _context(tmp_path),
            OptimizeEpisodeVideoCommand(episode_num=3),
        )


@pytest.mark.asyncio
async def test_schedule_rejects_episode_without_sketches(tmp_path: Path) -> None:
    use_cases = GlobalVideoOptimizationUseCases(
        _Source(_materials()),
        _Sketches(False),
        _Scheduler(),
    )

    with pytest.raises(
        GlobalVideoOptimizationSketchesMissing,
        match="没有草图，请先生成草图再执行全局优化",
    ):
        await use_cases.schedule(
            _context(tmp_path),
            OptimizeEpisodeVideoCommand(episode_num=3),
        )

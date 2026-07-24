from pathlib import Path

import pytest

from ai_anime.modules.production.application.single_video import (
    GenerateSingleVideoCommand,
    SingleVideoTask,
    SingleVideoTaskReceipt,
    SingleVideoUseCases,
)


class _Preparer:
    def __init__(self, task: SingleVideoTask) -> None:
        self.task = task
        self.calls = []

    async def prepare(self, context, command):
        self.calls.append((context, command))
        return self.task


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        return SingleVideoTaskReceipt(
            task_id="task-1",
            task_key="task:single_video:project:proj-1:3:2",
            backend="celery",
            queue="node.local.video",
        )


def _command() -> GenerateSingleVideoCommand:
    return GenerateSingleVideoCommand(
        episode_num=3,
        beat_num=2,
        video_backend="huimeng_seedance-2.0-fast",
        resolution="1080p",
        duration=9,
        ratio="16:9",
        generate_audio=False,
        provided_fields=frozenset(
            {"duration", "ratio", "generate_audio"}
        ),
    )


def test_command_projects_only_explicit_seedance2_controls() -> None:
    command = _command()

    assert command.was_provided("ratio") is True
    assert command.was_provided("resolution") is False
    assert command.seedance2_config_overrides() == {
        "duration": 9,
        "ratio": "16:9",
        "generate_audio": False,
    }


@pytest.mark.asyncio
async def test_generate_prepares_schedules_and_projects_receipt(
    tmp_path: Path,
) -> None:
    context = object()
    command = _command()
    task = SingleVideoTask(
        episode_num=3,
        beat_num=2,
        config={"prompt": "video prompt"},
        output_dir=tmp_path,
    )
    preparer = _Preparer(task)
    scheduler = _Scheduler()

    scheduled = await SingleVideoUseCases(preparer, scheduler).generate(
        context,
        command,
    )

    assert preparer.calls == [(context, command)]
    assert scheduler.calls == [(context, task)]
    assert task.backend_payload() == {
        "config": {"prompt": "video prompt"},
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "single_video",
        "task_id": "task-1",
        "task_key": "task:single_video:project:proj-1:3:2",
        "backend": "celery",
        "queue": "node.local.video",
        "message": "第 3 集 Beat 2 视频生成已入队",
    }

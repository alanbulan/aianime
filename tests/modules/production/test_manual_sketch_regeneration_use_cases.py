from pathlib import Path

import pytest

from ai_anime.modules.production.application.manual_sketch_regeneration import (
    GenerateMissingManualSketchesCommand,
    ManualSketchRegenerationSegment,
    ManualSketchRegenerationUseCases,
    PreparedManualSketchRegeneration,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SelectedRegenerationKind,
    SelectedRegenerationTask,
    SelectedRegenerationTaskReceipt,
)


class _Preparer:
    def __init__(self, prepared: PreparedManualSketchRegeneration) -> None:
        self.prepared = prepared
        self.calls = []

    async def prepare(self, context, command):
        self.calls.append((context, command))
        return self.prepared


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        task_number = len(self.calls)
        return SelectedRegenerationTaskReceipt(
            task_id=f"task-{task_number}",
            task_key=f"task-key-{task_number}",
            backend="celery",
            queue="default",
        )


def _segment(
    tmp_path: Path,
    beat_numbers: tuple[int, ...],
    scope: str,
) -> ManualSketchRegenerationSegment:
    return ManualSketchRegenerationSegment(
        beat_numbers=beat_numbers,
        task=SelectedRegenerationTask(
            kind=SelectedRegenerationKind.SKETCH,
            episode_num=2,
            mode_key="manual-mode",
            scope=scope,
            output_dir=tmp_path,
            config={"selected_beat_numbers": list(beat_numbers)},
        ),
    )


@pytest.mark.asyncio
async def test_manual_sketch_regeneration_schedules_each_segment_and_projects_response(
    tmp_path: Path,
) -> None:
    context = object()
    command = GenerateMissingManualSketchesCommand(episode_num=2)
    prepared = PreparedManualSketchRegeneration(
        episode_num=2,
        segments=(
            _segment(tmp_path, (41, 42), "scope-a"),
            _segment(tmp_path, (43,), "scope-b"),
        ),
    )
    preparer = _Preparer(prepared)
    scheduler = _Scheduler()

    scheduled = await ManualSketchRegenerationUseCases(
        preparer,
        scheduler,
    ).generate(context, command)

    assert preparer.calls == [(context, command)]
    assert scheduler.calls == [
        (context, prepared.segments[0].task),
        (context, prepared.segments[1].task),
    ]
    assert scheduled.as_dict() == {
        "ok": True,
        "task_type": "sketch_regen",
        "data": {
            "dispatched": 2,
            "scopes": ["scope-a", "scope-b"],
            "segments": [[41, 42], [43]],
        },
        "message": "已启动 2 组新增分镜草图生成",
    }


@pytest.mark.asyncio
async def test_manual_sketch_regeneration_returns_noop_without_scheduling() -> None:
    context = object()
    command = GenerateMissingManualSketchesCommand(episode_num=2)
    preparer = _Preparer(PreparedManualSketchRegeneration(episode_num=2, segments=()))
    scheduler = _Scheduler()

    scheduled = await ManualSketchRegenerationUseCases(
        preparer,
        scheduler,
    ).generate(context, command)

    assert scheduler.calls == []
    assert scheduled.as_dict() == {
        "ok": True,
        "data": {"dispatched": 0, "scopes": [], "segments": []},
        "message": "没有缺草图的手工分镜",
    }

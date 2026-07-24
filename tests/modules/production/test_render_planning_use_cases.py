from pathlib import Path

import pytest

from ai_anime.modules.production.application.render_planning import (
    BuildRenderPlanCommand,
    ExecuteRenderPlanCommand,
    RenderExecutionMaterials,
    RenderPlanConflict,
    RenderPlanFeatureDisabled,
    RenderPlanGridTaskReceipt,
    RenderPlanningMaterials,
    RenderPlanRejected,
    RenderPlanUseCases,
)
from ai_anime.modules.production.domain.render_planning import RenderPlanGrid


class _Availability:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled

    def is_enabled(self) -> bool:
        return self.enabled


class _Preparer:
    def __init__(self, materials: RenderPlanningMaterials) -> None:
        self.materials = materials
        self.prepare_calls = []
        self.execution_calls = []

    async def prepare(self, context, **kwargs):
        self.prepare_calls.append((context, kwargs))
        return self.materials

    async def prepare_execution(self, context, **kwargs):
        self.execution_calls.append((context, kwargs))
        return RenderExecutionMaterials(
            prop_menu=[{"prop_id": "prop-1"}],
            sketch_aspect_padding=True,
        )


class _Engine:
    def __init__(
        self,
        plan: tuple[RenderPlanGrid, ...],
        *,
        fingerprint: str = "fingerprint-1",
        plan_hash: str = "plan-hash-1",
        fingerprint_error: Exception | None = None,
    ) -> None:
        self.plan = plan
        self.fingerprint_value = fingerprint
        self.plan_hash = plan_hash
        self.fingerprint_error = fingerprint_error
        self.build_calls = []
        self.fingerprint_calls = []
        self.hash_calls = []

    def build(self, materials, **kwargs):
        self.build_calls.append((materials, kwargs))
        return self.plan

    def fingerprint(self, context, materials, **kwargs):
        self.fingerprint_calls.append((context, materials, kwargs))
        if self.fingerprint_error:
            raise self.fingerprint_error
        return self.fingerprint_value

    def hash(self, plan):
        self.hash_calls.append(plan)
        return self.plan_hash


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        return RenderPlanGridTaskReceipt(task_id=f"task-{len(self.calls)}")


def _grid(beat_number: int = 2) -> RenderPlanGrid:
    return RenderPlanGrid(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(beat_number,),
    )


def _materials() -> RenderPlanningMaterials:
    beats = [
        {"beat_number": 1},
        {"beat_number": 2},
    ]
    return RenderPlanningMaterials(
        all_beats=beats,
        selected_beats=[beats[1]],
        character_map={"hero": {"ref_path": "hero.png"}},
        sketch_colors={"hero": "#ffffff"},
        style="cinematic",
        image_generation_selection="render-selection",
    )


def _use_cases(
    engine: _Engine,
    *,
    enabled: bool = True,
) -> tuple[RenderPlanUseCases, _Preparer, _Scheduler]:
    preparer = _Preparer(_materials())
    scheduler = _Scheduler()
    return (
        RenderPlanUseCases(
            _Availability(enabled),
            preparer,
            engine,
            scheduler,
        ),
        preparer,
        scheduler,
    )


def test_render_plan_availability_is_enforced() -> None:
    use_cases, *_ = _use_cases(_Engine((_grid(),)), enabled=False)

    with pytest.raises(
        RenderPlanFeatureDisabled,
        match="DISABLE_RENDER_PLAN_V2 is set",
    ):
        use_cases.ensure_available()


@pytest.mark.asyncio
async def test_plan_normalizes_selection_and_projects_result() -> None:
    grid = _grid()
    engine = _Engine((grid,))
    use_cases, preparer, scheduler = _use_cases(engine)
    context = object()

    result = await use_cases.plan(
        context,
        BuildRenderPlanCommand(
            episode_num=2,
            beat_numbers=(2, 2),
            strategy="naive",
            aspect_mode="9:16",
            image_generation_selection="requested",
        ),
    )

    assert preparer.prepare_calls == [
        (
            context,
            {
                "episode_num": 2,
                "beat_numbers": (2,),
                "image_generation_selection": "requested",
            },
        )
    ]
    assert scheduler.calls == []
    assert result.as_dict() == {
        "plan": [grid.as_dict()],
        "plan_hash": "plan-hash-1",
        "input_fingerprint": "fingerprint-1",
        "strategy": "naive",
        "total_beats": 1,
        "total_grids": 1,
    }


@pytest.mark.asyncio
async def test_execute_validates_then_prepares_and_schedules_each_grid(
    tmp_path: Path,
) -> None:
    grid = _grid()
    engine = _Engine((grid,))
    use_cases, preparer, scheduler = _use_cases(engine)
    context = type("Context", (), {"output_dir": tmp_path})()

    result = await use_cases.execute(
        context,
        ExecuteRenderPlanCommand(
            episode_num=2,
            plan=(grid,),
            plan_hash="plan-hash-1",
            input_fingerprint="fingerprint-1",
            strategy="naive",
            aspect_mode="9:16",
            beat_numbers=(2,),
            sketch_aspect_padding=True,
        ),
    )

    assert len(preparer.execution_calls) == 1
    assert len(scheduler.calls) == 1
    task = scheduler.calls[0][1]
    assert task.backend_payload() == {
        "episode": 2,
        "mode_key": "1x1_2-3",
        "output_dir": str(tmp_path),
        "config": {
            "beats": _materials().all_beats,
            "character_map": {"hero": {"ref_path": "hero.png"}},
            "style": "cinematic",
            "model": "nanobanana",
            "image_generation_selection": "render-selection",
            "sketch_colors": {"hero": "#ffffff"},
            "prop_menu": [{"prop_id": "prop-1"}],
            "sketch_aspect_padding": True,
            "mode_key": "1x1_2-3",
            "selected_beat_numbers": [2],
        },
    }
    assert result.as_dict() == {
        "task_type": "render_plan",
        "message": "渲染已启动 (1 个网格)",
        "scope": "naive__plan-hash-1",
        "resolved_grids": [grid.as_dict()],
        "task_ids": ["task-1"],
    }


@pytest.mark.asyncio
async def test_execute_reports_stale_input_before_execution_materials() -> None:
    grid = _grid()
    engine = _Engine((grid,), fingerprint="new-fingerprint")
    use_cases, preparer, scheduler = _use_cases(engine)

    with pytest.raises(RenderPlanConflict) as captured:
        await use_cases.execute(
            object(),
            ExecuteRenderPlanCommand(
                episode_num=2,
                plan=(grid,),
                plan_hash="plan-hash-1",
                input_fingerprint="old-fingerprint",
                strategy="naive",
                aspect_mode="9:16",
                beat_numbers=(2,),
            ),
        )

    assert captured.value.as_dict() == {
        "ok": False,
        "error": "input_stale",
        "data": {
            "new_plan": [grid.as_dict()],
            "new_plan_hash": "plan-hash-1",
            "new_input_fingerprint": "new-fingerprint",
        },
    }
    assert preparer.execution_calls == []
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_execute_rejects_invalid_custom_plan_before_scheduling() -> None:
    grid = _grid()
    invalid_grid = RenderPlanGrid(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(),
    )
    use_cases, preparer, scheduler = _use_cases(_Engine((grid,)))

    with pytest.raises(RenderPlanRejected) as captured:
        await use_cases.execute(
            object(),
            ExecuteRenderPlanCommand(
                episode_num=2,
                plan=(invalid_grid,),
                plan_hash="ignored",
                input_fingerprint="fingerprint-1",
                strategy="naive",
                aspect_mode="9:16",
                beat_numbers=(2,),
                custom_plan=True,
            ),
        )

    assert captured.value.as_dict() == {
        "ok": False,
        "error": "invalid_custom_plan",
        "data": {"reason": "empty_grid"},
    }
    assert preparer.execution_calls == []
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_missing_reference_is_mapped_to_invalid_beats() -> None:
    use_cases, *_ = _use_cases(
        _Engine(
            (_grid(),),
            fingerprint_error=FileNotFoundError("hero.png"),
        )
    )

    with pytest.raises(RenderPlanRejected) as captured:
        await use_cases.plan(
            object(),
            BuildRenderPlanCommand(
                episode_num=2,
                beat_numbers=(2,),
                strategy="naive",
                aspect_mode="9:16",
            ),
        )

    assert captured.value.as_dict() == {
        "ok": False,
        "error": "invalid_beats",
        "data": {"reason": "missing ref image: hero.png"},
    }

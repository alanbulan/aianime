import pytest

from ai_anime.modules.production.domain.render_planning import (
    RenderPlanGrid,
    custom_render_plan_error,
    invalid_render_beat_numbers,
    normalize_render_beat_numbers,
)


def _grid(
    beat_numbers: tuple[int, ...],
    *,
    rows: int = 1,
    cols: int = 2,
) -> RenderPlanGrid:
    return RenderPlanGrid(
        mode_key="1x2_4-3",
        rows=rows,
        cols=cols,
        beat_numbers=beat_numbers,
    )


def test_render_beat_numbers_are_normalized_and_validated() -> None:
    assert normalize_render_beat_numbers((3, 1, 3, 2)) == (3, 1, 2)
    assert invalid_render_beat_numbers(
        [{"beat_number": 1}, {"beat_number": 3}],
        (3, 2, 0),
    ) == (2, 0)


@pytest.mark.parametrize(
    ("plan", "beat_numbers", "error"),
    [
        ((_grid(()),), (1,), "empty_grid"),
        ((_grid((1, 2), rows=1, cols=1),), (1, 2), "grid_capacity"),
        ((_grid((1,)), _grid((1,))), (1,), "duplicate_beat"),
        ((_grid((1,)),), (1, 2), "beat_mismatch"),
    ],
)
def test_custom_render_plan_validation_reports_exact_reason(
    plan: tuple[RenderPlanGrid, ...],
    beat_numbers: tuple[int, ...],
    error: str,
) -> None:
    assert custom_render_plan_error(plan, beat_numbers) == error


def test_render_plan_grid_projects_the_api_shape() -> None:
    grid = RenderPlanGrid(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(2,),
        location="alley",
        reasons=("force-1x1",),
        warnings=("warning",),
    )

    assert grid.as_dict() == {
        "mode_key": "1x1_2-3",
        "rows": 1,
        "cols": 1,
        "beat_numbers": [2],
        "location": "alley",
        "padding_count": 0,
        "reasons": ["force-1x1"],
        "warnings": ["warning"],
    }

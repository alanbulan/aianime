from ai_anime.modules.production.domain.sketch_generation import (
    has_sketch_color_assignments,
    invalid_sketch_grid_error,
    sketch_dispatch_indices,
    sketch_grid_labels,
)


def test_sketch_color_assignment_requires_character_or_identity_color() -> None:
    assert has_sketch_color_assignments({}) is False
    assert has_sketch_color_assignments({"hero": {"sketch_color": ""}}) is False
    assert (
        has_sketch_color_assignments(
            {"hero": {"identity_sketch_colors": {"young": "#3366ff"}}}
        )
        is True
    )
    assert (
        has_sketch_color_assignments({"hero": {"sketch_color": "#3366ff"}})
        is True
    )


def test_sketch_grid_index_rules_preserve_all_grid_sentinel_and_error() -> None:
    grid_plan = ((1, 1), (2, 2))

    assert sketch_grid_labels(grid_plan) == "1x1 + 2x2"
    assert (
        invalid_sketch_grid_error(
            grid_index=-1,
            beat_count=5,
            grid_plan=grid_plan,
        )
        is None
    )
    assert (
        invalid_sketch_grid_error(
            grid_index=2,
            beat_count=5,
            grid_plan=grid_plan,
        )
        == "grid_index=2 超出范围。共 5 个 beats，分割方案: 1x1 + 2x2，"
        "有效 grid_index: 0~1"
    )
    assert sketch_dispatch_indices(-1, 2) == (0, 1)
    assert sketch_dispatch_indices(1, 2) == (1,)

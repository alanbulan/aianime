"""Pure rules for scheduling episode sketch grids."""

from __future__ import annotations

from typing import Any


GridShape = tuple[int, int]


def has_sketch_color_assignments(
    character_map: dict[str, dict[str, Any]],
) -> bool:
    return any(
        info.get("identity_sketch_colors") or info.get("sketch_color")
        for info in character_map.values()
    )


def sketch_grid_labels(grid_plan: tuple[GridShape, ...]) -> str:
    return " + ".join(f"{rows}x{cols}" for rows, cols in grid_plan)


def invalid_sketch_grid_error(
    *,
    grid_index: int,
    beat_count: int,
    grid_plan: tuple[GridShape, ...],
) -> str | None:
    if -1 <= grid_index < len(grid_plan):
        return None
    return (
        f"grid_index={grid_index} 超出范围。"
        f"共 {beat_count} 个 beats，分割方案: {sketch_grid_labels(grid_plan)}，"
        f"有效 grid_index: 0~{len(grid_plan) - 1}"
    )


def sketch_dispatch_indices(
    grid_index: int,
    grid_count: int,
) -> tuple[int, ...]:
    if grid_index == -1:
        return tuple(range(grid_count))
    return (grid_index,)

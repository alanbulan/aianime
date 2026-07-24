"""Pure validation rules for selected-Beat image regeneration."""

from __future__ import annotations


def selected_beat_indices_error(
    beat_indices: tuple[int, ...],
    total_beats: int,
) -> str | None:
    if not beat_indices:
        return "beat_indices 不能为空"
    invalid = [index for index in beat_indices if index < 1 or index > total_beats]
    if invalid:
        return (
            f"beat_indices {invalid} 超出范围（共 {total_beats} 个 beats，"
            f"有效: 1~{total_beats}）"
        )
    return None

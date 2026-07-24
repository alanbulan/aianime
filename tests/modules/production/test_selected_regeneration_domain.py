from ai_anime.modules.production.domain.selected_regeneration import (
    selected_beat_indices_error,
)


def test_selected_beat_indices_require_non_empty_in_range_values() -> None:
    assert selected_beat_indices_error((), 3) == "beat_indices 不能为空"
    assert (
        selected_beat_indices_error((0, 4), 3)
        == "beat_indices [0, 4] 超出范围（共 3 个 beats，有效: 1~3）"
    )
    assert selected_beat_indices_error((3, 1), 3) is None

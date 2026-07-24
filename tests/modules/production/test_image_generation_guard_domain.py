from __future__ import annotations

import pytest

from ai_anime.modules.production.domain.image_generation_guard import (
    image_generation_guard,
)


@pytest.mark.parametrize(
    ("attempt_count", "next_attempt", "level"),
    [
        (0, 1, "none"),
        (1, 2, "none"),
        (2, 3, "confirm"),
        (3, 4, "confirm"),
        (4, 5, "locked"),
        (8, 9, "locked"),
    ],
)
def test_generation_guard_levels(
    attempt_count: int,
    next_attempt: int,
    level: str,
) -> None:
    guard = image_generation_guard(attempt_count, "Beat 3")

    assert guard.attempt_count == attempt_count
    assert guard.next_attempt == next_attempt
    assert guard.level == level


def test_generation_guard_messages_preserve_subject_and_password_requirement() -> None:
    confirm = image_generation_guard(2, "Beat 3")
    locked = image_generation_guard(4, "Beat 3")

    assert "Beat 3" in confirm.message
    assert "确认" in confirm.message
    assert "Beat 3" in locked.message
    assert "密码" in locked.message

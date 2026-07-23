from __future__ import annotations

import pytest

from ai_anime.modules.narrative_planning.domain import (
    select_beat_video_prompt_target,
    select_script_beat_context,
)
from ai_anime.modules.narrative_planning.public import (
    BeatNotFound,
    FinalBeatTransitionNotAllowed,
    ScriptNotFound,
)


def test_selects_first_frame_prompt_context() -> None:
    beats = [
        {"beat_number": 1},
        {"beat_number": 2, "video_mode": "first_frame"},
        {"beat_number": 3},
    ]

    selection = select_beat_video_prompt_target({"beats": beats}, 2)

    assert selection.beat is beats[1]
    assert selection.previous_beat is beats[0]
    assert selection.next_beat is beats[2]
    assert selection.field == "video_prompt"


def test_selects_shared_script_beat_context() -> None:
    beats = [{"beat_number": 1}, {"beat_number": 2}, {"beat_number": 3}]

    selection = select_script_beat_context({"beats": beats}, 2)

    assert selection.beat is beats[1]
    assert selection.previous_beat is beats[0]
    assert selection.next_beat is beats[2]


def test_rejects_keyframe_prompt_for_final_beat() -> None:
    with pytest.raises(FinalBeatTransitionNotAllowed):
        select_beat_video_prompt_target(
            {"beats": [{"beat_number": 1, "video_mode": "keyframe"}]},
            1,
        )


@pytest.mark.parametrize(
    ("script", "error"),
    [
        (None, ScriptNotFound),
        ({"beats": [{"beat_number": 1}]}, BeatNotFound),
    ],
)
def test_reports_missing_script_or_beat(script, error) -> None:
    with pytest.raises(error):
        select_beat_video_prompt_target(script, 2)

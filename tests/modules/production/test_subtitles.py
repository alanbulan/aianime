from __future__ import annotations

import pytest

from ai_anime.modules.production.domain.subtitles import (
    SubtitleCue,
    build_subtitle_cues,
    split_subtitle_text,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("你好。再见！", ["你好。", "再见！"]),
        ("她说：“你好！”下一句。", ["她说：“你好！”", "下一句。"]),
        ("数值是 3.14。下一句。", ["数值是 3.14。", "下一句。"]),
        ("First sentence. Value 3.14 is valid!", ["First sentence.", "Value 3.14 is valid!"]),
        ("第一行\r\n第二行", ["第一行", "第二行"]),
        ("真的吗！？我想想……好。", ["真的吗！？", "我想想……", "好。"]),
        (" \n ", []),
    ],
)
def test_subtitles_keep_sentence_punctuation_and_decimal_numbers(
    text: str, expected: list[str],
) -> None:
    assert split_subtitle_text(text) == expected


def test_long_subtitles_split_at_clauses_without_losing_text() -> None:
    text = "这是第一段需要完整保留的对白，接下来我们继续沿着街道向前走直到看见朋友正在车站等候。"
    parts = split_subtitle_text(text)
    assert parts[0] == "这是第一段需要完整保留的对白，"
    assert all(len(part) <= 36 for part in parts)
    assert "".join(parts) == text


def test_cue_timing_uses_sentence_lengths_and_preserves_silent_clips() -> None:
    assert build_subtitle_cues(
        [(6.0, ["甲。", "乙乙乙。"]), (3.0, []), (1.0, ["好。"])]
    ) == [
        SubtitleCue(start=0.0, end=2.0, text="甲。"),
        SubtitleCue(start=2.0, end=6.0, text="乙乙乙。"),
        SubtitleCue(start=9.0, end=10.0, text="好。"),
    ]


def test_fractional_cue_timing_ends_at_the_actual_clip_boundary() -> None:
    cues = build_subtitle_cues(
        [(1.001, ["一。", "二。", "三。"]), (2.004, ["四。", "五。"])]
    )
    assert cues[2].end == cues[3].start == 1.001
    assert cues[-1].end == pytest.approx(3.005)
    assert all(left.end == right.start for left, right in zip(cues, cues[1:]))

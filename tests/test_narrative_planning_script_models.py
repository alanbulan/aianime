from ai_anime.modules.narrative_planning.public import (
    NarrationScript,
    VisualBeat,
    format_beat_narration,
)


def test_visual_beat_keeps_scene_reference_behavior() -> None:
    beat = VisualBeat(
        beat_number=1,
        narration_segment="旁白",
        visual_description="画面",
        scene_ref={
            "scene_id": "宫门",
            "variant_id": "夜",
            "render_anchor_id": "selected_background",
            "render_anchor_source_id": "master",
        },
    )

    assert beat.scene_id == "宫门"
    assert beat.scene_ref is not None
    assert beat.scene_ref.variant_id == "夜"
    assert beat.scene_ref.render_anchor_id == "selected_background"
    assert beat.scene_ref.render_anchor_source_id == "master"

    beat.scene_id = "寝殿"

    assert beat.scene_ref is not None
    assert beat.scene_ref.scene_id == "寝殿"
    assert beat.scene_ref.variant_id == ""


def test_narration_script_sums_estimated_beat_duration() -> None:
    script = NarrationScript(
        episode_number=2,
        beats=[
            VisualBeat(
                beat_number=1,
                narration_segment="第一句",
                visual_description="画面一",
                estimated_duration=4.5,
            ),
            VisualBeat(
                beat_number=2,
                narration_segment="第二句",
                visual_description="画面二",
                estimated_duration=5.0,
            ),
        ],
    )

    assert script.get_total_duration() == 9.5


def test_format_beat_narration_preserves_audio_labels() -> None:
    assert format_beat_narration("narration", "", "旁白") == "旁白"
    assert format_beat_narration("dialogue", "苏鸾", "住手") == "【台词·苏鸾】住手"
    assert format_beat_narration("dialogue", "", "住手") == "【台词】住手"
    assert format_beat_narration("silence", "", "不应输出") == ""

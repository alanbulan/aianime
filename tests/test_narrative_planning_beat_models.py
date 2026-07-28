from ai_anime.modules.narrative_planning.application.beat_models import (
    NovelVisualBeat,
    SceneRef,
    beat_scene_ref,
    build_scene_ref,
    sync_beat_asset_refs,
)


def test_scene_ref_defaults_and_builder() -> None:
    assert SceneRef().model_dump() == {
        "scene_id": "",
        "variant_id": "",
        "render_anchor_id": "",
        "render_anchor_source_id": "",
    }
    assert build_scene_ref("  皇宫  ", "  夜景  ") == SceneRef(
        scene_id="皇宫",
        variant_id="夜景",
    )
    assert build_scene_ref("  ") is None


def test_beat_scene_ref_reads_legacy_fields() -> None:
    scene_ref = beat_scene_ref(
        {
            "scene_ref": {
                "base_id": "皇宫",
                "variant_id": "夜景",
                "background_ref_id": "selected_background",
                "background_ref_source_id": "reverse",
            }
        }
    )

    assert scene_ref == SceneRef(
        scene_id="皇宫",
        variant_id="夜景",
        render_anchor_id="selected_background",
        render_anchor_source_id="reverse",
    )


def test_sync_beat_asset_refs_writes_only_canonical_scene_ref() -> None:
    beat = {
        "scene_id": "皇宫",
        "scene_ref": {
            "scene_id": "皇宫",
            "variant_id": "夜景",
            "anchor_id": "selected_background",
        },
    }

    assert sync_beat_asset_refs(beat) is beat
    assert beat == {
        "scene_ref": {
            "scene_id": "皇宫",
            "variant_id": "夜景",
            "render_anchor_id": "selected_background",
            "render_anchor_source_id": "",
        }
    }


def test_novel_visual_beat_fills_required_runtime_text() -> None:
    beat = NovelVisualBeat(beat_number=1, episode_number=2)

    assert beat.narration == "(empty)"
    assert beat.visual_description == "场景画面：(empty)"
    assert beat.scene_ref_json == ""
    assert beat.scene_ref is None
    assert beat.scene_id == ""


def test_novel_visual_beat_normalizes_legacy_scene_ref_keys() -> None:
    beat = NovelVisualBeat(
        beat_number=1,
        episode_number=2,
        narration="旁白",
        visual_description="画面",
        scene_ref_json=(
            '{"base_id":"皇宫","variant_id":"夜景",'
            '"anchor_id":"selected_background","anchor_source_id":"master"}'
        ),
    )

    assert beat.scene_ref_json == (
        '{"scene_id": "皇宫", "variant_id": "夜景", '
        '"render_anchor_id": "selected_background", '
        '"render_anchor_source_id": "master"}'
    )
    assert beat.scene_ref is not None
    assert beat.scene_ref.scene_id == "皇宫"
    assert beat.scene_id == "皇宫"


def test_novel_visual_beat_keeps_empty_manual_shot_text() -> None:
    beat = NovelVisualBeat(
        beat_number=1,
        episode_number=2,
        is_manual_shot=True,
    )

    assert beat.narration == ""
    assert beat.visual_description == ""

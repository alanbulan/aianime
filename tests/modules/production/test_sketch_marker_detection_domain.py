from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
    classify_sketch_marker_detections,
    map_grid_panel_detections,
    sketch_detection_grid_shape,
    split_detected_marker_keys,
)


@pytest.mark.parametrize(
    ("count", "expected"),
    [
        (1, (1, 1)),
        (4, (2, 2)),
        (9, (3, 3)),
        (16, (4, 4)),
        (25, (5, 5)),
    ],
)
def test_grid_shape_tracks_supported_batch_sizes(
    count: int,
    expected: tuple[int, int],
) -> None:
    assert sketch_detection_grid_shape(count) == expected


def test_panel_mapping_uses_exact_grid_order_and_ignores_invalid_indices() -> None:
    frames = [
        SketchDetectionFrame(10, Path("beat_10.png")),
        SketchDetectionFrame(2, Path("beat_2.png")),
    ]

    result = map_grid_panel_detections(
        frames,
        {
            "1": ["Hero_Main"],
            2: ["Prop_Global"],
            "invalid": ["ignored"],
            3: ["out_of_range"],
        },
    )

    assert result == {10: ["Hero_Main"], 2: ["Prop_Global"]}


def test_marker_split_keeps_only_episode_identities_and_colorable_props() -> None:
    beats = [{"visual_description": "{{Hero_Main}} uses [[Prop_Global]] and [[Prop_Local]]"}]
    characters = [
        {"identities": [{"identity_id": "Hero_Main"}]},
    ]

    identities, props = split_detected_marker_keys(
        ["Hero_Main", "Hero_Main", "Prop_Global", "Prop_Local", "unknown"],
        beats,
        characters,
        allowed_prop_ids={"Prop_Global"},
    )

    assert identities == ["Hero_Main"]
    assert props == ["Prop_Global"]


def test_classification_adds_explicit_empty_markers_and_counts_real_values() -> None:
    frames = [
        SketchDetectionFrame(1, Path("beat_1.png")),
        SketchDetectionFrame(1, Path("beat_01.png")),
        SketchDetectionFrame(2, Path("beat_2.png")),
    ]
    beats = [
        {"beat_number": 1, "visual_description": "{{Hero_Main}} [[Prop_Global]]"},
        {"beat_number": 2, "visual_description": "empty"},
    ]

    result = classify_sketch_marker_detections(
        frames=frames,
        detections={1: ["Hero_Main", "Prop_Global"]},
        beats=beats,
        characters=[{"identities": [{"identity_id": "Hero_Main"}]}],
        allowed_prop_ids={"Prop_Global"},
    )

    assert result.identities == {
        1: ["Hero_Main"],
        2: ["__NO_CHARACTER__"],
    }
    assert result.props == {
        1: ["Prop_Global"],
        2: ["__NO_PROP__"],
    }
    assert result.total_identities == 1
    assert result.total_props == 1


def test_classification_clamps_false_positive_to_explicit_beat_identity() -> None:
    result = classify_sketch_marker_detections(
        frames=[SketchDetectionFrame(1, Path("beat_1.png"))],
        detections={1: ["Hero_Main", "Heroine_Main"]},
        beats=[
            {
                "beat_number": 1,
                "visual_description": "{{Hero_Main}}独自走入教室。",
            }
        ],
        characters=[
            {"identities": [{"identity_id": "Hero_Main"}]},
            {"identities": [{"identity_id": "Heroine_Main"}]},
        ],
        allowed_prop_ids=set(),
    )

    assert result.identities == {1: ["Hero_Main"]}

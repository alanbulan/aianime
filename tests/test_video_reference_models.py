import pytest

from ai_anime.modules.production.application.video_config import (
    VideoReferenceMode,
    BeatVideoConfig,
    dump_video_config,
    parse_video_config,
)


pytestmark = pytest.mark.m09


def test_video_config_defaults_to_multimodal_reference():
    config = BeatVideoConfig()

    assert config.mode == VideoReferenceMode.MULTIMODAL_REFERENCE
    assert config.duration == 4
    assert config.resolution == "720p"
    assert config.ratio == "9:16"
    assert config.generate_audio is True
    assert config.human_review is True


def test_parse_video_config_rejects_plain_string_legacy_shape():
    config = parse_video_config("  cinematic prompt  ")

    assert config.final_prompt == ""
    assert config.mode == VideoReferenceMode.MULTIMODAL_REFERENCE


def test_parse_video_config_preserves_false_values_without_legacy_markers():
    config = parse_video_config(
        {
            "generate_audio": False,
            "human_review": False,
        }
    )

    assert config.generate_audio is False
    assert config.human_review is False


def test_parse_video_config_preserves_scene_optimize():
    config = parse_video_config({"scene_optimize": " anime "})

    assert config.scene_optimize == "anime"


def test_dump_video_config_round_trips_normalized_config():
    dumped = dump_video_config(
        {
            "mode": "first_last_frame",
            "duration": "6",
            "reference_image_paths": ["frames/a.png", "frames/b.png"],
        }
    )
    config = parse_video_config(dumped)

    assert config.mode == VideoReferenceMode.FIRST_LAST_FRAME
    assert config.duration == 6
    assert config.reference_image_paths == ["frames/a.png", "frames/b.png"]

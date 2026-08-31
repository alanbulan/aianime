import pytest

from ai_anime.modules.production.domain.video_model import (
    normalize_video_generation_duration,
    normalize_video_ratio,
    uses_advanced_reference_video_workflow,
    uses_reference_video_workflow,
    validate_video_resolution_duration,
    video_api_resolution,
    video_output_size,
    video_resolution,
)


def test_video_workflows_are_declared_by_capability() -> None:
    assert uses_advanced_reference_video_workflow("advanced-reference") is True
    assert uses_advanced_reference_video_workflow("standard") is False
    assert uses_reference_video_workflow("reference") is True
    assert uses_reference_video_workflow("advanced-reference") is False


def test_video_duration_respects_audio_config_and_model_bounds() -> None:
    assert normalize_video_generation_duration(0.768, 4, minimum_seconds=4) == 4
    assert normalize_video_generation_duration(4, 8.86, minimum_seconds=4) == 9
    with pytest.raises(ValueError, match="超过所选模型支持的最大时长"):
        normalize_video_generation_duration(15.2, maximum_seconds=15)


def test_video_resolution_respects_each_model_capability() -> None:
    assert video_api_resolution("1080x1920") == "1080p"
    assert video_api_resolution("1280x1920") == "1080p"
    assert video_api_resolution("1366x768") == "768p"
    assert video_api_resolution("854x1280") == "720p"
    assert video_resolution(
        "video-model-a",
        "1080p",
        ("480p", "720p", "1080p"),
    ) == "1080p"
    assert video_resolution("video-model-a", "512p", ("512p", "768p")) == "512p"
    with pytest.raises(ValueError, match="不支持分辨率 1080p"):
        video_resolution("video-model-a", "1080p", ("480p", "720p"))
    with pytest.raises(ValueError, match="不支持分辨率 480p"):
        video_resolution("video-model-b", "480p", ("720p", "1080p"))
    assert video_output_size("2:3", "1080p") == "1280x1920"
    assert video_output_size("16:9", "768p") == "1366x768"
    assert video_output_size("2:3", "720p") == "854x1280"
    assert video_output_size("16:9", "1344x768") == "1344x768"
    assert video_output_size("16:9", "512p") == "910x512"
    assert video_resolution(
        "video-model-c",
        "768x1344",
        (),
        ("1344x768", "768x1344", "1024x1024"),
    ) == "768x1344"
    with pytest.raises(ValueError, match="不支持分辨率 1280x720"):
        video_resolution(
            "video-model-c",
            "1280x720",
            (),
            ("1344x768", "768x1344", "1024x1024"),
        )


def test_video_ratio_and_duration_limits_use_declared_capabilities() -> None:
    assert normalize_video_ratio("3:4", ("16:9", "3:4")) == "3:4"
    assert normalize_video_ratio("2:3", ("16:9", "3:4")) == "16:9"
    validate_video_resolution_duration("1080p", 6, (("1080p", 6),))
    with pytest.raises(ValueError, match="最多支持 6 秒"):
        validate_video_resolution_duration("1080p", 10, (("1080p", 6),))

import pytest

from ai_anime.modules.production.domain.video_model import video_output_size

from ai_anime.modules.production.public import (
    grok_video_ratio,
    grok_video_resolution,
    happyhorse_ratio,
    happyhorse_resolution,
    is_grok_video_model,
    is_happyhorse_model,
    is_seedance2_model,
    normalize_video_generation_duration,
    video_api_resolution,
    video_resolution,
)


def test_video_model_families_accept_bare_skus_only() -> None:
    assert is_seedance2_model("seedance-2.0-fast") is True
    assert is_seedance2_model("video-seeddance-4wlmqpxwma4r65j3") is True
    assert is_seedance2_model("newapi_seedance-2.0-fast") is False
    assert is_seedance2_model("seedance-1.5-pro") is False
    assert is_happyhorse_model("happyhorse-1.0") is True
    assert is_happyhorse_model("huimengi_happyhorse-1.0") is False
    assert is_grok_video_model("grok-video-channel") is True
    assert is_grok_video_model("newapi_grok-video-channel") is False


def test_video_duration_respects_audio_config_and_model_bounds() -> None:
    assert normalize_video_generation_duration(0.768, 4, minimum_seconds=4) == 4
    assert normalize_video_generation_duration(4, 8.86, minimum_seconds=4) == 9
    with pytest.raises(ValueError, match="超过所选模型支持的最大时长"):
        normalize_video_generation_duration(15.2, maximum_seconds=15)


def test_video_resolution_respects_each_model_capability() -> None:
    assert video_api_resolution("1080x1920") == "1080p"
    assert video_api_resolution("1280x1920") == "1080p"
    assert video_api_resolution("854x1280") == "720p"
    assert video_resolution("seedance-2.0", "1080p") == "1080p"
    assert video_resolution("seedance-2.0-fast", "1080p") == "720p"
    assert video_resolution("seedance-2.0-value", "480p") == "720p"
    assert video_output_size("2:3", "1080p") == "1280x1920"
    assert video_output_size("2:3", "720p") == "854x1280"


def test_happyhorse_and_grok_request_values_use_supported_fallbacks() -> None:
    assert happyhorse_resolution("720x1280") == "720p"
    assert happyhorse_resolution(None) == "1080p"
    assert happyhorse_ratio("3:4") == "3:4"
    assert happyhorse_ratio("2:3") == "16:9"
    assert grok_video_resolution("480p") == "480p"
    assert grok_video_resolution("1080p") == "720p"
    assert grok_video_ratio("2:3") == "2:3"
    assert grok_video_ratio("4:3") == "16:9"

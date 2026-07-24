from ai_anime.modules.production.public import (
    DEFAULT_VIDEO_BACKEND,
    grok_video_ratio,
    grok_video_resolution,
    happyhorse_ratio,
    happyhorse_resolution,
    is_grok_video_backend,
    is_happyhorse_backend,
    is_seedance2_backend,
    seedance2_api_resolution,
    seedance2_resolution,
)


def test_video_backend_families_have_one_normalization_rule() -> None:
    assert DEFAULT_VIDEO_BACKEND == "newapi_seedance-1.0-pro-fast"
    assert is_seedance2_backend("huimeng_seedance-2.0-fast") is True
    assert is_seedance2_backend("newapi_seedance-1.5-pro") is False
    assert is_happyhorse_backend("huimengi_happyhorse-1.0") is True
    assert is_grok_video_backend("newapi_grok-video-channel") is True


def test_seedance2_resolution_respects_each_model_capability() -> None:
    assert seedance2_api_resolution("1080x1920") == "1080p"
    assert seedance2_resolution("newapi_seedance-2.0", "1080p") == "1080p"
    assert seedance2_resolution("newapi_seedance-2.0-fast", "1080p") == "720p"
    assert seedance2_resolution("newapi_seedance-2.0-value", "480p") == "720p"


def test_happyhorse_and_grok_request_values_use_supported_fallbacks() -> None:
    assert happyhorse_resolution("720x1280") == "720p"
    assert happyhorse_resolution(None) == "1080p"
    assert happyhorse_ratio("3:4") == "3:4"
    assert happyhorse_ratio("2:3") == "16:9"
    assert grok_video_resolution("480p") == "480p"
    assert grok_video_resolution("1080p") == "720p"
    assert grok_video_ratio("2:3") == "2:3"
    assert grok_video_ratio("4:3") == "16:9"

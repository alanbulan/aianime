from ai_anime.modules.production.application.video_backend_catalog import (
    VideoBackendCatalogUseCases,
)
from ai_anime.modules.production.infrastructure.video_backend_catalog import (
    ConfiguredVideoBackendSource,
)


def test_configured_catalog_exposes_mainline_happyhorse_limits() -> None:
    options = {
        item.value: item.as_dict()
        for item in VideoBackendCatalogUseCases(
            ConfiguredVideoBackendSource()
        ).list_options()
    }
    happyhorse = options["newapi_happyhorse-1.0"]

    assert happyhorse["is_happyhorse"] is True
    assert happyhorse["is_seedance2"] is False
    assert happyhorse["resolution_options"] == ["720p", "1080p"]
    assert happyhorse["ratio_options"] == ["16:9", "9:16", "1:1", "4:3", "3:4"]
    assert happyhorse["supported_modes"] == [
        "first_frame",
        "multimodal_reference",
    ]
    assert happyhorse["reference_image_max"] == 9
    assert happyhorse["reference_video_max"] == 1
    assert happyhorse["reference_audio_max"] == 0


def test_configured_catalog_reads_duration_bounds_at_call_time(monkeypatch) -> None:
    from ai_anime import config

    monkeypatch.setattr(
        config,
        "NEWAPI_VIDEO_DURATION_BOUNDS",
        "happyhorse-1.0:5-9",
    )

    assert ConfiguredVideoBackendSource().duration_bounds() == {
        "happyhorse-1.0": (5, 9)
    }

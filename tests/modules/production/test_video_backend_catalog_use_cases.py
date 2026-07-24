from ai_anime.modules.production.application.video_backend_catalog import (
    VideoBackendCatalogUseCases,
)


class _Source:
    def options(self) -> dict[str, str]:
        return {
            "newapi_seedance-1.0-pro-fast": "Seedance 1.0 Pro Fast",
            "newapi_seedance-2.0-fast": "Seedance 2.0 Fast",
            "newapi_seedance-1.5-pro": "Seedance 1.5 Pro",
            "newapi_grok-video-channel": "Grok Video",
        }

    def model(self, video_backend: str) -> str | None:
        return video_backend.removeprefix("newapi_") or None

    def duration_bounds(self) -> dict[str, tuple[int, int]]:
        return {"seedance-2.0-fast": (4, 12)}


def test_catalog_projects_backend_capabilities_and_duration_fallbacks() -> None:
    options = {
        item.value: item.as_dict()
        for item in VideoBackendCatalogUseCases(_Source()).list_options()
    }

    assert options["newapi_seedance-1.0-pro-fast"]["is_default"] is True
    assert options["newapi_seedance-2.0-fast"]["is_seedance2"] is True
    assert options["newapi_seedance-2.0-fast"]["min_duration"] == 4
    assert options["newapi_seedance-2.0-fast"]["max_duration"] == 12
    assert options["newapi_seedance-1.5-pro"]["dialogue_only"] is True

    grok = options["newapi_grok-video-channel"]
    assert grok["is_grok_video"] is True
    assert grok["min_duration"] == 6
    assert grok["max_duration"] == 30
    assert grok["reference_image_max"] == 7
    assert grok["reference_video_max"] == 0
    assert grok["reference_audio_max"] == 0

    happyhorse = options["newapi_happyhorse-1.0"]
    assert happyhorse["label"] == "HappyHorse 1.0"
    assert happyhorse["min_duration"] == 3
    assert happyhorse["max_duration"] == 15
    assert happyhorse["resolution_options"] == ["720p", "1080p"]
    assert happyhorse["ratio_options"] == ["16:9", "9:16", "1:1", "4:3", "3:4"]
    assert happyhorse["supported_modes"] == [
        "first_frame",
        "multimodal_reference",
    ]
    assert happyhorse["reference_image_max"] == 9
    assert happyhorse["reference_video_max"] == 1
    assert happyhorse["reference_audio_max"] == 0

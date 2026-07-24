"""Video backend selection and request-normalization rules."""

from __future__ import annotations

DEFAULT_VIDEO_BACKEND = "newapi_seedance-1.0-pro-fast"

SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL = {
    "seedance-2.0-fast": ("480p", "720p"),
    "seedance-2.0": ("480p", "720p", "1080p"),
    "seedance-2.0-value": ("720p", "1080p"),
    "seedance-2.0-fast-value": ("720p", "1080p"),
    "seedance-1.5-pro": ("480p", "720p", "1080p"),
}
SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS = ("480p", "720p")
HAPPYHORSE_RESOLUTION_OPTIONS = ("720p", "1080p")
HAPPYHORSE_RATIO_OPTIONS = ("16:9", "9:16", "1:1", "4:3", "3:4")
HAPPYHORSE_SUPPORTED_MODES = ("first_frame", "multimodal_reference")
GROK_VIDEO_RESOLUTION_OPTIONS = ("720p", "480p")
GROK_VIDEO_RATIO_OPTIONS = ("16:9", "9:16", "1:1", "2:3", "3:2")
GROK_VIDEO_SUPPORTED_MODES = ("first_frame", "multimodal_reference")


def video_model_from_backend(video_backend: str | None) -> str:
    value = str(video_backend or "").strip().lower()
    for prefix in ("newapi_", "huimeng_", "huimengi_"):
        if value.startswith(prefix):
            return value[len(prefix) :].strip()
    return value


def is_seedance2_backend(video_backend: str | None) -> bool:
    value = str(video_backend or "").strip()
    for prefix in ("huimeng_", "huimengi_", "newapi_"):
        if value.startswith(prefix):
            return value[len(prefix) :].strip().startswith("seedance-2.0")
    return False


def is_happyhorse_backend(video_backend: str | None) -> bool:
    return video_model_from_backend(video_backend) == "happyhorse-1.0"


def is_grok_video_backend(video_backend: str | None) -> bool:
    return video_model_from_backend(video_backend) == "grok-video-channel"


def seedance2_api_resolution(resolution: str | None) -> str:
    value = str(resolution or "").strip()
    if value in {"480p", "720p", "1080p"}:
        return value
    if "480" in value:
        return "480p"
    if "1080" in value:
        return "1080p"
    return "720p"


def seedance2_resolution_options(video_backend: str | None) -> tuple[str, ...]:
    return SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL.get(
        video_model_from_backend(video_backend),
        SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS,
    )


def seedance2_resolution(
    video_backend: str | None,
    resolution: str | None,
) -> str:
    clean_resolution = seedance2_api_resolution(resolution)
    options = seedance2_resolution_options(video_backend)
    if clean_resolution in options:
        return clean_resolution
    if "720p" in options:
        return "720p"
    return options[0]


def happyhorse_resolution(resolution: str | None) -> str:
    return "720p" if "720" in str(resolution or "").strip().lower() else "1080p"


def happyhorse_ratio(ratio: str | None) -> str:
    value = str(ratio or "").strip()
    return value if value in HAPPYHORSE_RATIO_OPTIONS else "16:9"


def grok_video_resolution(resolution: str | None) -> str:
    value = str(resolution or "").strip().lower()
    return value if value in GROK_VIDEO_RESOLUTION_OPTIONS else "720p"


def grok_video_ratio(ratio: str | None) -> str:
    value = str(ratio or "").strip()
    return value if value in GROK_VIDEO_RATIO_OPTIONS else "16:9"

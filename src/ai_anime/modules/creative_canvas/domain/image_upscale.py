"""Creative Canvas image upscale rules."""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

SUPPORTED_CREATIVE_CANVAS_IMAGE_ASPECT_RATIOS = frozenset(
    {
        "1:1",
        "3:2",
        "2:3",
        "16:9",
        "9:16",
        "5:4",
        "4:5",
        "4:3",
        "3:4",
        "21:9",
        "9:21",
        "1:3",
        "3:1",
        "2:1",
        "1:2",
    }
)


class InvalidCreativeCanvasImageSize(ValueError):
    pass


@dataclass(frozen=True)
class CreativeCanvasImageCameraConfig:
    camera_body: str = ""
    lens: str = ""
    focal_length_mm: int | None = None
    aperture: str = ""


@dataclass(frozen=True)
class CreativeCanvasImageStyleConfig:
    template_id: str


def resolve_original_image_aspect_ratio(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        raise InvalidCreativeCanvasImageSize(
            f"invalid source image size: {width}x{height}"
        )

    normalized_gcd = gcd(width, height)
    normalized_ratio = f"{width // normalized_gcd}:{height // normalized_gcd}"
    if normalized_ratio in SUPPORTED_CREATIVE_CANVAS_IMAGE_ASPECT_RATIOS:
        return normalized_ratio

    current_ratio = width / height
    return min(
        SUPPORTED_CREATIVE_CANVAS_IMAGE_ASPECT_RATIOS,
        key=lambda ratio: abs(_aspect_ratio_value(ratio) - current_ratio),
    )


def build_image_upscale_prompt() -> str:
    return (
        "Upscale and restore the image while preserving the original composition, "
        "subject identity, lighting, perspective, and style. Improve sharpness, "
        "edge definition, material detail, skin and fabric texture fidelity, and "
        "overall clarity naturally. Do not redesign the image, change the framing, "
        "alter the subject, or introduce extra objects, text, watermark, or artifacts."
    )


def _aspect_ratio_value(ratio: str) -> float:
    width, height = ratio.split(":", 1)
    return int(width) / int(height)

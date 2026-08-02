"""Creative Canvas image editing rules."""

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


class InvalidCreativeCanvasImageAspectRatio(ValueError):
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


@dataclass(frozen=True)
class CreativeCanvasOutpaintCanvasPlan:
    width: int
    height: int
    offset_x: int
    offset_y: int


def resolve_requested_image_aspect_ratio(
    width: int,
    height: int,
    requested_aspect_ratio: str,
) -> str:
    if str(requested_aspect_ratio or "").strip().lower() != "original":
        return requested_aspect_ratio
    return resolve_original_image_aspect_ratio(width, height)


def resolve_original_image_aspect_ratio(width: int, height: int) -> str:
    _require_valid_image_size(width, height)

    normalized_gcd = gcd(width, height)
    normalized_ratio = f"{width // normalized_gcd}:{height // normalized_gcd}"
    if normalized_ratio in SUPPORTED_CREATIVE_CANVAS_IMAGE_ASPECT_RATIOS:
        return normalized_ratio

    current_ratio = width / height
    return min(
        SUPPORTED_CREATIVE_CANVAS_IMAGE_ASPECT_RATIOS,
        key=lambda ratio: abs(_aspect_ratio_value(ratio) - current_ratio),
    )


def plan_outpaint_canvas(
    width: int,
    height: int,
    target_aspect_ratio: str,
) -> CreativeCanvasOutpaintCanvasPlan:
    _require_valid_image_size(width, height)
    target_width_ratio, target_height_ratio = parse_image_aspect_ratio(
        target_aspect_ratio
    )
    current_ratio = width / height
    target_ratio = target_width_ratio / target_height_ratio
    if abs(current_ratio - target_ratio) < 1e-4:
        return CreativeCanvasOutpaintCanvasPlan(width, height, 0, 0)

    if current_ratio > target_ratio:
        canvas_width = width
        canvas_height = max(height, round(width / target_ratio))
    else:
        canvas_height = height
        canvas_width = max(width, round(height * target_ratio))
    return CreativeCanvasOutpaintCanvasPlan(
        width=canvas_width,
        height=canvas_height,
        offset_x=(canvas_width - width) // 2,
        offset_y=(canvas_height - height) // 2,
    )


def parse_image_aspect_ratio(value: str) -> tuple[int, int]:
    text = str(value or "").strip().replace("-", ":").replace(" ", "")
    try:
        width_text, height_text = text.split(":", 1)
        width = int(width_text)
        height = int(height_text)
    except (AttributeError, TypeError, ValueError) as exc:
        raise InvalidCreativeCanvasImageAspectRatio(
            f"invalid aspect_ratio: {value!r}"
        ) from exc
    if width <= 0 or height <= 0:
        raise InvalidCreativeCanvasImageAspectRatio(
            f"invalid aspect_ratio: {value!r}"
        )
    return width, height


def build_image_upscale_prompt() -> str:
    return (
        "Upscale and restore the image while preserving the original composition, "
        "subject identity, lighting, perspective, and style. Improve sharpness, "
        "edge definition, material detail, skin and fabric texture fidelity, and "
        "overall clarity naturally. Do not redesign the image, change the framing, "
        "alter the subject, or introduce extra objects, text, watermark, or artifacts."
    )


def build_image_outpaint_prompt() -> str:
    return (
        "Extend the existing image outward beyond its current borders. "
        "Preserve the original composition, subject identity, style, and camera "
        "framing in the center. Fill only the newly added outer canvas areas "
        "naturally and seamlessly. Do not crop, stretch, or replace the original "
        "visible content."
    )


def build_image_redraw_prompt(prompt: str) -> str:
    base = (prompt or "").strip()
    prefix = (
        "Redraw and refine the provided image while preserving the core composition, "
        "subject identity, camera angle, and scene intent unless the prompt explicitly "
        "asks for changes."
    )
    return f"{prefix}\n\n{base}" if base else prefix


def build_image_erase_prompt() -> str:
    return (
        "Remove the content inside the masked region and fill it in naturally. "
        "Preserve the surrounding composition, subject identity, lighting, "
        "perspective, and image style. The regenerated area must blend seamlessly "
        "with nearby pixels and should not leave obvious repair traces, repeated "
        "textures, or artifacts."
    )


def _require_valid_image_size(width: int, height: int) -> None:
    if width <= 0 or height <= 0:
        raise InvalidCreativeCanvasImageSize(
            f"invalid source image size: {width}x{height}"
        )


def _aspect_ratio_value(ratio: str) -> float:
    width, height = ratio.split(":", 1)
    return int(width) / int(height)

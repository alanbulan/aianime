"""Creative Canvas image catalog and prompt rules."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
)
from ai_anime.modules.creative_canvas.domain.style_template_catalog import (
    creative_canvas_builtin_style_templates,
    creative_canvas_legacy_style_templates,
)

CREATIVE_CANVAS_IMAGE_CAMERA_OPTIONS = {
    "camera_bodies": [
        {"id": "panavision_dxl2", "label": "Panavision DXL2"},
        {"id": "arri_alexa_65", "label": "ARRI ALEXA 65"},
        {"id": "red_vraptor_xl", "label": "RED V-Raptor XL"},
        {"id": "sony_venice_2", "label": "Sony Venice 2"},
    ],
    "lenses": [
        {"id": "arri_signature_prime", "label": "Arri Signature Prime"},
        {"id": "cooke_s4i", "label": "Cooke S4/i"},
        {"id": "zeiss_supreme_prime", "label": "Zeiss Supreme Prime"},
        {"id": "panavision_primo_70", "label": "Panavision Primo 70"},
    ],
    "focal_lengths_mm": [8, 14, 24, 35, 50, 75, 125],
    "apertures": ["f/1.4", "f/2", "f/2.8", "f/4", "f/5.6", "f/8"],
}
CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES = creative_canvas_builtin_style_templates()
_LEGACY_CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES = (
    creative_canvas_legacy_style_templates()
)


class UnknownCreativeCanvasImageStyleTemplate(ValueError):
    pass


def creative_canvas_image_camera_options() -> dict:
    return CREATIVE_CANVAS_IMAGE_CAMERA_OPTIONS


def creative_canvas_image_style_templates() -> list[dict]:
    return list(CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES)


def build_image_camera_prompt(
    camera: CreativeCanvasImageCameraConfig | None,
) -> str:
    if camera is None:
        return ""

    parts: list[str] = []
    if str(camera.camera_body or "").strip():
        parts.append(str(camera.camera_body).strip())
    if str(camera.lens or "").strip():
        parts.append(str(camera.lens).strip())
    if camera.focal_length_mm:
        parts.append(f"{int(camera.focal_length_mm)}mm")
    if str(camera.aperture or "").strip():
        parts.append(str(camera.aperture).strip())
    if not parts:
        return ""

    return (
        "Camera setup:\n"
        f"- {' | '.join(parts)}\n"
        "- Preserve this camera language in framing, lens feel, depth rendition, and overall optical character where applicable."
    )


def resolve_creative_canvas_image_style_template(
    style: CreativeCanvasImageStyleConfig | None,
) -> dict | None:
    if style is None:
        return None
    template_id = str(style.template_id or "").strip()
    if not template_id:
        return None
    for item in CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES:
        if item["id"] == template_id:
            return item
    for item in _LEGACY_CREATIVE_CANVAS_IMAGE_STYLE_TEMPLATES:
        if item["id"] == template_id:
            return item
    raise UnknownCreativeCanvasImageStyleTemplate(
        f"unknown image style template: {template_id}"
    )


def build_image_style_prompt(style: CreativeCanvasImageStyleConfig | None) -> str:
    template = resolve_creative_canvas_image_style_template(style)
    if template is None:
        return ""
    return (
        "Style template:\n"
        f"- {template['label']} ({template['author']})\n"
        f"- {template['style_prompt']}"
    )


def merge_image_prompt_with_style_and_camera(
    prompt: str,
    style: CreativeCanvasImageStyleConfig | None,
    camera: CreativeCanvasImageCameraConfig | None,
) -> str:
    base = (prompt or "").strip()
    style_block = build_image_style_prompt(style)
    camera_block = build_image_camera_prompt(camera)
    parts = [part for part in [base, style_block, camera_block] if part]
    return "\n\n".join(parts)

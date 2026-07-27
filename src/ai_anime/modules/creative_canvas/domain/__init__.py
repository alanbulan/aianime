"""Creative Canvas domain rules."""

from ai_anime.modules.creative_canvas.domain.image_to_3gs import (
    CreativeCanvasImageToThreeGsPlan,
    CreativeCanvasImageToThreeGsSourceKind,
    InvalidCreativeCanvasImageToThreeGsSource,
    infer_image_to_three_gs_scene_id,
    plan_image_to_three_gs,
)
from ai_anime.modules.creative_canvas.domain.image_editing import (
    DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL,
    SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS,
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    InvalidCreativeCanvasImageAspectRatio,
    InvalidCreativeCanvasImageSize,
    UnsupportedCreativeCanvasImageProvider,
    build_image_erase_prompt,
    build_image_outpaint_prompt,
    build_image_redraw_prompt,
    build_image_upscale_prompt,
    plan_outpaint_canvas,
    resolve_original_image_aspect_ratio,
    resolve_image_provider,
    resolve_requested_image_aspect_ratio,
)
from ai_anime.modules.creative_canvas.domain.image_editing_prompts import (
    InvalidCreativeCanvasImageTemplateMode,
    build_image_multi_view_prompt,
    build_image_relight_prompt,
    build_image_template_edit_prompt,
    resolve_image_template_aspect_ratio,
)
from ai_anime.modules.creative_canvas.domain.media import (
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasPngScreenshot,
    decode_png_screenshot,
    normalize_screenshot_label,
)
from ai_anime.modules.creative_canvas.domain.mark_detection import (
    CreativeCanvasMarkSelection,
    CreativeCanvasMarkSelectionRequired,
)
from ai_anime.modules.creative_canvas.domain.principal import canvas_actor_id

__all__ = [
    "DEFAULT_CREATIVE_CANVAS_IMAGE_MODEL",
    "CreativeCanvasImageToThreeGsPlan",
    "CreativeCanvasImageToThreeGsSourceKind",
    "CreativeCanvasImageCameraConfig",
    "CreativeCanvasImageStyleConfig",
    "SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS",
    "CreativeCanvasScreenshotTooLarge",
    "CreativeCanvasMarkSelection",
    "CreativeCanvasMarkSelectionRequired",
    "InvalidCreativeCanvasPngScreenshot",
    "InvalidCreativeCanvasImageToThreeGsSource",
    "InvalidCreativeCanvasImageAspectRatio",
    "InvalidCreativeCanvasImageSize",
    "InvalidCreativeCanvasImageTemplateMode",
    "UnsupportedCreativeCanvasImageProvider",
    "build_image_erase_prompt",
    "build_image_multi_view_prompt",
    "build_image_outpaint_prompt",
    "build_image_relight_prompt",
    "build_image_redraw_prompt",
    "build_image_template_edit_prompt",
    "build_image_upscale_prompt",
    "canvas_actor_id",
    "decode_png_screenshot",
    "infer_image_to_three_gs_scene_id",
    "normalize_screenshot_label",
    "plan_image_to_three_gs",
    "plan_outpaint_canvas",
    "resolve_original_image_aspect_ratio",
    "resolve_image_provider",
    "resolve_image_template_aspect_ratio",
    "resolve_requested_image_aspect_ratio",
]

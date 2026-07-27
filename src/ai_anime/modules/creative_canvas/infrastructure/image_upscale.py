"""Creative Canvas image upscale adapters."""

from pathlib import Path

from PIL import Image

from ai_anime.freezone.route_helpers import (
    FREEZONE_DEFAULT_IMAGE_MODEL,
    merge_prompt_with_style_and_camera,
    resolve_freezone_image_provider,
    split_provider_and_model,
)
from ai_anime.modules.creative_canvas.domain.image_upscale import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    build_image_upscale_prompt,
)


class PillowCreativeCanvasImageInspector:
    def size(self, source_path: Path) -> tuple[int, int]:
        with Image.open(source_path) as image:
            return image.size


class FreezoneCreativeCanvasImageUpscalePromptComposer:
    def compose(
        self,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str:
        return merge_prompt_with_style_and_camera(
            build_image_upscale_prompt(),
            style,
            camera,
        )


class FreezoneCreativeCanvasImageModelRouter:
    def resolve(self, model: str) -> tuple[str, str | None]:
        provider, resolved_model = split_provider_and_model(
            None,
            model or FREEZONE_DEFAULT_IMAGE_MODEL,
        )
        return (
            resolve_freezone_image_provider(provider, strict=False),
            resolved_model,
        )

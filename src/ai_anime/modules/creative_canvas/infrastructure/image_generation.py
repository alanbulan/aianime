"""Creative Canvas image generation adapters."""

from ai_anime.modules.creative_canvas.infrastructure.image_models import (
    resolve_configured_image_model,
)


class FreezoneCreativeCanvasImageGenerationModelRouter:
    def resolve(
        self,
        model: str,
    ) -> str:
        return resolve_configured_image_model(model)

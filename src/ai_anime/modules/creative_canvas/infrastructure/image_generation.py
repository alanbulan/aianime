"""Creative Canvas image generation adapters."""

from ai_anime.modules.creative_canvas.domain.image_editing import resolve_image_provider
from ai_anime.modules.creative_canvas.infrastructure.image_models import (
    resolve_configured_image_model,
)


class FreezoneCreativeCanvasImageGenerationModelRouter:
    def resolve(
        self,
        provider: str | None,
        model: str | None,
    ) -> tuple[str, str | None]:
        resolved_provider, resolved_model = resolve_configured_image_model(
            provider, model
        )
        return resolve_image_provider(resolved_provider), resolved_model

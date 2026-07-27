"""Creative Canvas image generation adapters."""

from ai_anime.freezone.route_helpers import (
    split_provider_and_model,
)
from ai_anime.modules.creative_canvas.domain.image_editing import resolve_image_provider


class FreezoneCreativeCanvasImageGenerationModelRouter:
    def resolve(
        self,
        provider: str | None,
        model: str | None,
    ) -> tuple[str, str | None]:
        resolved_provider, resolved_model = split_provider_and_model(provider, model)
        return resolve_image_provider(resolved_provider), resolved_model

"""Configuration-backed Creative Canvas image model routing."""

from ai_anime.config import IMAGE_GENERATION_SELECTIONS
from ai_anime.modules.creative_canvas.domain.image_editing import (
    SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS,
)


def resolve_configured_image_model(
    provider: str | None,
    model: str | None,
    *,
    fallback_model: str | None = None,
) -> tuple[str | None, str | None]:
    model_text = str(model or "").strip()
    if model_text in IMAGE_GENERATION_SELECTIONS:
        entry = IMAGE_GENERATION_SELECTIONS[model_text]
        return entry["provider"], entry["model"]

    if provider:
        return provider, model_text or fallback_model
    if model_text and "/" in model_text:
        provider_token, model_token = model_text.split("/", 1)
        if provider_token in SUPPORTED_CREATIVE_CANVAS_IMAGE_PROVIDERS:
            return provider_token, model_token or fallback_model
    return provider, model_text or fallback_model

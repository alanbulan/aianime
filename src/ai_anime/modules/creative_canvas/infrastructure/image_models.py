"""Creative Canvas image SKU validation."""


def resolve_configured_image_model(
    model: str,
) -> str:
    model_text = str(model or "").strip()
    if not model_text:
        raise ValueError("model is required")
    return model_text

from ai_anime.modules.model_usage.domain import (
    image_billing_params,
    image_model_supports_quality,
)


def test_image_quality_capability_is_shared_with_billing_params() -> None:
    supported = (
        "lingshan-g2",
        "gpt-image-2",
        "openai/gpt-image-1",
        "image-2",
        "image-2-official",
    )
    for model in supported:
        assert image_model_supports_quality(model) is True
        assert image_billing_params(model=model, quality="high") == {
            "quality": "high"
        }

    assert image_model_supports_quality("gemini-3-pro-image-preview") is False
    assert image_billing_params(
        model="gemini-3-pro-image-preview",
        quality="high",
    ) == {}

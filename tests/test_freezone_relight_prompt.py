from pydantic import ValidationError

from ai_anime.api.routes.creative_canvas.image_schemas import FreezoneRelightRequest
from ai_anime.modules.creative_canvas.domain.image_editing_prompts import (
    build_image_relight_prompt,
)


def _build_prompt(body: FreezoneRelightRequest) -> str:
    return build_image_relight_prompt(
        has_lighting_reference=bool(body.lighting_reference_url),
        scope=body.scope,
        smart_mode=body.smart_mode,
        brightness=body.brightness,
        color_hex=body.color_hex,
        color_temperature_kelvin=body.color_temperature_kelvin,
        key_light_direction=body.key_light_direction,
        rim_light=body.rim_light,
        prompt=body.prompt,
    )


def test_relight_prompt_keeps_color_hex_and_color_temperature_kelvin() -> None:
    body = FreezoneRelightRequest(
        source_url="/static/source.png",
        brightness=60,
        color_hex="#FFB877",
        color_temperature_kelvin=3200,
        model="cloud-image-standard",
    )

    prompt = _build_prompt(body)

    assert "Key light color / overall color tone: #FFB877." in prompt
    assert "Color temperature: 3200K (warm tungsten / amber practical light)." in prompt


def test_relight_prompt_keeps_legacy_color_hex_fallback() -> None:
    body = FreezoneRelightRequest(
        source_url="/static/source.png",
        color_hex="#FFB877",
        model="cloud-image-standard",
    )

    prompt = _build_prompt(body)

    assert "Key light color / overall color tone: #FFB877." in prompt
    assert "Color temperature:" not in prompt


def test_relight_color_temperature_kelvin_is_bounded() -> None:
    try:
        FreezoneRelightRequest(
            source_url="/static/source.png",
            color_temperature_kelvin=1300,
            model="cloud-image-standard",
        )
    except ValidationError as exc:
        assert "color_temperature_kelvin" in str(exc)
    else:
        raise AssertionError("Expected color_temperature_kelvin below range to be rejected")

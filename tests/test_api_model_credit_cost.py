import pytest
from fastapi import HTTPException


def patch_quote(*, expected_model: str, cost: int) -> None:
    from ai_anime.modules.model_usage.public import CreditQuote
    from ai_anime.ports.registry import register_port

    class FakeCreditQuotePort:
        async def generation_credit_quote(
            self,
            *,
            kind: str,
            model: str,
            params=None,
            quantity=1,
        ):
            del kind, params, quantity
            assert model == expected_model
            return CreditQuote(total_cost=cost, display=str(cost))

    register_port("credit_quote", FakeCreditQuotePort())


def patch_quote_expect(
    *,
    expected_kind: str,
    expected_model: str,
    expected_params: dict,
    expected_quantity: int,
    cost: int,
) -> None:
    from ai_anime.modules.model_usage.public import CreditQuote
    from ai_anime.ports.registry import register_port

    class FakeCreditQuotePort:
        async def generation_credit_quote(
            self,
            *,
            kind: str,
            model: str,
            params=None,
            quantity=1,
        ):
            assert kind == expected_kind
            assert model == expected_model
            assert params == expected_params
            assert quantity == expected_quantity
            return CreditQuote(total_cost=cost, display=str(cost))

    register_port("credit_quote", FakeCreditQuotePort())


def patch_quote_display_mismatch(cost: int, display: str) -> None:
    from ai_anime.modules.model_usage.public import CreditQuote
    from ai_anime.ports.registry import register_port

    class FakeCreditQuotePort:
        async def generation_credit_quote(
            self,
            *,
            kind: str,
            model: str,
            params=None,
            quantity=1,
        ):
            return CreditQuote(total_cost=cost, display=display)

    register_port("credit_quote", FakeCreditQuotePort())


@pytest.mark.asyncio
async def test_generation_credit_cost_route_keeps_local_display_helper():
    from ai_anime.api.routes import model_credits

    patch_quote_display_mismatch(cost=8, display="different")

    result = await model_credits.get_generation_credit_cost(
        kind="model",
        value="gpt-image-2",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 8, "display": "8"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_uses_ce_zero_quote_port():
    from ai_anime.api.routes import model_credits
    from ai_anime.modules.model_usage.public import build_local_credit_quote
    from ai_anime.ports.registry import register_port

    register_port("credit_quote", build_local_credit_quote())

    result = await model_credits.get_generation_credit_cost(
        kind="model",
        value="gpt-image-2",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 0, "display": "0"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_model_kind():
    from ai_anime.api.routes import model_credits

    patch_quote(expected_model="gpt-image-2", cost=5)

    result = await model_credits.get_generation_credit_cost(
        kind="model",
        value=" gpt-image-2 ",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 5, "display": "5"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_passes_params_and_quantity(monkeypatch):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setitem(
        config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"],
        "model",
        "gpt-image-2",
    )
    patch_quote_expect(
        expected_kind="image",
        expected_model="gpt-image-2",
        expected_params={"quality": "high", "size": "2k"},
        expected_quantity=3,
        cost=24,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        value="newapi_gpt_image2",
        params='{"size":"2k","quality":"high"}',
        quantity=3,
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 24, "display": "24"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_rejects_blank_model():
    from ai_anime.api.routes import model_credits

    with pytest.raises(HTTPException) as exc_info:
        await model_credits.get_generation_credit_cost(
            kind="model",
            value="   ",
            user={"user_id": "usr_1"},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "model is required"


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_beat_tts(monkeypatch):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setattr(config, "INDEXTTS2_RECORD_MODEL", "index-tts-2")

    patch_quote(expected_model="index-tts-2", cost=3)

    result = await model_credits.get_generation_credit_cost(
        kind="beat_tts",
        value="",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 3, "display": "3"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_freezone_audio_music():
    from ai_anime.api.routes import model_credits

    patch_quote_expect(
        expected_kind="audio",
        expected_model="LingShan-MU-11",
        expected_params={},
        expected_quantity=30,
        cost=90,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="freezone_audio_music",
        value="",
        quantity=30,
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 90, "display": "90"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_freezone_story_script():
    from ai_anime.api.routes import model_credits

    patch_quote(
        expected_model="ai-anime-freezone-story-script-writer-LLM",
        cost=4,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="freezone_story_script",
        value="",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 4, "display": "4"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_freezone_image_reverse_prompt(
    monkeypatch,
):
    from ai_anime.api.routes import model_credits

    monkeypatch.setenv("FREEZONE_VISION_MODEL", "freezone-vision-model")
    patch_quote_expect(
        expected_kind="text",
        expected_model="freezone-vision-model",
        expected_params={},
        expected_quantity=1,
        cost=6,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="freezone_image_reverse_prompt",
        value="",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 6, "display": "6"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_style_analyzer(monkeypatch):
    from ai_anime.api.routes import model_credits

    monkeypatch.setenv("STYLE_ANALYZER_MODEL", "style-analyzer-model")
    patch_quote_expect(
        expected_kind="text",
        expected_model="style-analyzer-model",
        expected_params={},
        expected_quantity=1,
        cost=7,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="style_analyzer",
        value="",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 7, "display": "7"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_image_selection():
    from ai_anime.api.routes import model_credits
    from ai_anime import config

    expected_model = config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"]["model"]

    patch_quote(expected_model=expected_model, cost=7)

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        value="newapi_gpt_image2",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 7, "display": "7"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_image_selection_label():
    from ai_anime.api.routes import model_credits
    from ai_anime import config

    expected_model = config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"]["model"]

    patch_quote(expected_model=expected_model, cost=7)

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        value=config.character_image_selection_options()["newapi_gpt_image2"],
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 7, "display": "7"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_fixed_image():
    from ai_anime.api.routes import model_credits
    from ai_anime.generators.scene_reference_images import (
        resolve_scene_reference_image_model,
    )

    patch_quote(
        expected_model=resolve_scene_reference_image_model("master"),
        cost=9,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="fixed_image",
        value="scene_master",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 9, "display": "9"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_adds_scene_pano_params(monkeypatch):
    from ai_anime.api.routes import model_credits

    monkeypatch.setenv("SCENE_360_IMAGE_SIZE", "2K")
    monkeypatch.setenv("SCENE_360_IMAGE_QUALITY", "medium")
    monkeypatch.setenv("SCENE_360_IMAGE_PROVIDER", "newapi")
    monkeypatch.setenv("SCENE_360_IMAGE_MODEL", "gpt-image-2")
    patch_quote_expect(
        expected_kind="image",
        expected_model="gpt-image-2",
        expected_params={"size": "2K", "quality": "medium"},
        expected_quantity=1,
        cost=18,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="fixed_image",
        value="scene_pano",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 18, "display": "18"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_adds_image_mode_params(monkeypatch):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setattr(config, "OPENAI_IMAGE_QUALITY", "medium")
    monkeypatch.setitem(
        config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"],
        "model",
        "gpt-image-2",
    )
    patch_quote_expect(
        expected_kind="image",
        expected_model="gpt-image-2",
        expected_params={"size": "2K", "quality": "medium"},
        expected_quantity=1,
        cost=11,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        value="newapi_gpt_image2",
        mode_key="2x2_1-1",
        image_role="render",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 11, "display": "11"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_canvas_uses_only_explicit_params(
    monkeypatch,
):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setitem(
        config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"],
        "model",
        "gpt-image-2",
    )
    patch_quote_expect(
        expected_kind="image",
        expected_model="gpt-image-2",
        expected_params={"size": "2K"},
        expected_quantity=2,
        cost=16,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        surface="canvas",
        value="newapi_gpt_image2",
        params='{"size":"2K"}',
        quantity=2,
        mode_key="2x2_1-1",
        image_role="character",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 16, "display": "16"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_adds_character_image_params(monkeypatch):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setattr(config, "OPENAI_IMAGE_QUALITY", "medium")
    monkeypatch.setitem(
        config.IMAGE_GENERATION_SELECTIONS["newapi_gpt_image2"],
        "model",
        "gpt-image-2",
    )
    patch_quote_expect(
        expected_kind="image",
        expected_model="gpt-image-2",
        expected_params={"size": "1K", "quality": "medium"},
        expected_quantity=1,
        cost=13,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="image_selection",
        value="newapi_gpt_image2",
        image_role="character",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 13, "display": "13"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_keeps_video_params_and_quantity():
    from ai_anime.api.routes import model_credits

    patch_quote_expect(
        expected_kind="video",
        expected_model="seedance-1.0-pro-fast",
        expected_params={"resolution": "720p"},
        expected_quantity=5,
        cost=25,
    )

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value="newapi_seedance-1.0-pro-fast",
        params='{"resolution":"720p"}',
        quantity=5,
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 25, "display": "25"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_newapi_video_backend():
    from ai_anime.api.routes import model_credits

    patch_quote(expected_model="seedance-1.0-pro-fast", cost=12)

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value="newapi_seedance-1.0-pro-fast",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 12, "display": "12"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_newapi_video_backend_label():
    from ai_anime.api.routes import model_credits
    from ai_anime.generators.video_generator import newapi_video_backend_options

    patch_quote(expected_model="seedance-1.0-pro-fast", cost=12)

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value=newapi_video_backend_options()["newapi_seedance-1.0-pro-fast"],
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 12, "display": "12"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_huimeng_video_backend():
    from ai_anime.api.routes import model_credits

    patch_quote(expected_model="seedance-2.0-fast", cost=15)

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value="huimeng_seedance-2.0-fast",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 15, "display": "15"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_resolves_huimeng_video_backend_label():
    from ai_anime.api.routes import model_credits
    from ai_anime.generators.huimengi import huimeng_video_backend_options

    patch_quote(expected_model="seedance-2.0-fast", cost=15)

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value=huimeng_video_backend_options()["huimeng_seedance-2.0-fast"],
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 15, "display": "15"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_keeps_legacy_video_backend_values(
    monkeypatch,
):
    from ai_anime import config
    from ai_anime.api.routes import model_credits

    monkeypatch.setattr(config, "SEEDANCE_FAST_MODEL", "doubao-fast")

    patch_quote(expected_model="doubao-fast", cost=10)

    result = await model_credits.get_generation_credit_cost(
        kind="video_backend",
        value="seedance_fast",
        user={"user_id": "usr_1"},
    )

    assert result == {"ok": True, "data": {"cost": 10, "display": "10"}}


@pytest.mark.asyncio
async def test_generation_credit_cost_route_rejects_unknown_image_selection():
    from ai_anime.api.routes import model_credits

    with pytest.raises(HTTPException) as exc_info:
        await model_credits.get_generation_credit_cost(
            kind="image_selection",
            value="unknown",
            user={"user_id": "usr_1"},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "invalid image selection"


@pytest.mark.asyncio
async def test_generation_credit_cost_route_rejects_unknown_video_backend():
    from ai_anime.api.routes import model_credits

    with pytest.raises(HTTPException) as exc_info:
        await model_credits.get_generation_credit_cost(
            kind="video_backend",
            value="unknown_video_backend",
            user={"user_id": "usr_1"},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "invalid video backend"


@pytest.mark.asyncio
async def test_generation_credit_cost_route_rejects_unconfigured_fixed_image_model(
    monkeypatch,
):
    from ai_anime.api.routes import model_credits

    monkeypatch.setenv("SCENE_360_IMAGE_PROVIDER", "unsupported")

    with pytest.raises(HTTPException) as exc_info:
        await model_credits.get_generation_credit_cost(
            kind="fixed_image",
            value="scene_pano",
            user={"user_id": "usr_1"},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "generation model is not configured"

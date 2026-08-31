from ai_anime.modules.production.infrastructure.media_generation.scene_reference_images import (
    _scene_image_config,
    build_scene_reference_prompt,
)
from ai_anime.modules.asset_world.public import NovelScene


def test_scene_reference_prompt_combines_base_prompt_for_variant_without_base_image():
    base_scene = NovelScene(
        name="卫生间",
        scene_type="interior",
        environment_prompt="白瓷砖墙面，正面是洗手台。",
    )
    variant_scene = NovelScene(
        name="卫生间_漏水",
        scene_type="interior",
        base_scene_id="卫生间",
        variant_id="漏水",
        variant_prompt="地面积水，天花板持续滴水。",
        environment_prompt="",
    )

    prompt = build_scene_reference_prompt(
        "master",
        variant_scene,
        base_scene=base_scene,
    )

    assert "白瓷砖墙面" in prompt
    assert "地面积水" in prompt


def test_scene_reference_prompt_keeps_variant_delta_out_of_scene_description():
    base_scene = NovelScene(
        name="城市街道",
        scene_type="exterior",
        environment_prompt="正面：深灰色双向车道。左侧：现代商业立面。",
    )
    variant_scene = NovelScene(
        name="城市街道_雨夜版",
        scene_type="exterior",
        base_scene_id="城市街道",
        variant_id="雨夜版",
        variant_prompt="下着小雨，地面湿润有积水，反射微弱路灯光。",
        environment_prompt="",
    )

    prompt = build_scene_reference_prompt(
        "master",
        variant_scene,
        base_scene=base_scene,
    )

    assert "VARIANT DELTA PROMPT:\n下着小雨" in prompt
    scene_description = prompt.split("SCENE DESCRIPTION:", 1)[1].split(
        "PROJECT STYLE PRESET:", 1
    )[0]
    assert "正面：深灰色双向车道" in scene_description
    assert "下着小雨" not in scene_description
    assert "地面湿润有积水" not in scene_description


def test_scene_image_config_uses_catalog_quality_capability():
    from ai_anime.modules.model_usage.public import configure_model_access

    configure_model_access(
        allows_custom_models=False,
        mode="mixed",
        model_capabilities=[
            {
                "modelId": "image-model-with-quality",
                "extraParameterNames": ["quality"],
            },
            {"modelId": "image-model-basic"},
        ],
    )
    try:
        assert (
            _scene_image_config("image-model-with-quality")["quality"]
            == "medium"
        )
        assert "quality" not in _scene_image_config("image-model-basic")
    finally:
        configure_model_access(allows_custom_models=False, mode="mixed")


async def test_scene_reference_does_not_forward_gateway_credentials(monkeypatch, tmp_path):
    from ai_anime.modules.production.infrastructure.media_generation import (
        scene_reference_images,
    )

    captured: dict[str, object] = {}

    async def fake_call_image_generation_api(**kwargs):
        captured.update(kwargs)
        return b"image-bytes", "", ""

    monkeypatch.setattr(
        scene_reference_images,
        "_call_image_generation_api",
        fake_call_image_generation_api,
    )

    await scene_reference_images.generate_scene_reference_image(
        project_dir=tmp_path,
        scene=NovelScene(name="Hall", environment_prompt="wide hall"),
        kind="master",
        model="test-image-model",
    )

    assert "api_key" not in captured
    assert "base_url" not in captured

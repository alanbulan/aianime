from ai_anime.modules.asset_world.application.scene_models import (
    NovelScene,
    build_scene_effective_prompt,
)


def test_novel_scene_defaults_and_serialization() -> None:
    scene = NovelScene(name="皇宫·大殿")

    assert scene.model_dump() == {
        "name": "皇宫·大殿",
        "aliases": [],
        "scene_type": "interior",
        "base_scene_id": "",
        "variant_id": "",
        "time_of_day": "",
        "environment_prompt": "",
        "variant_prompt": "",
        "description": "",
        "spatial_layout_image": "",
        "notes": "",
        "updated_at": "",
    }


def test_build_scene_effective_prompt_combines_structured_scene_axes() -> None:
    base_scene = NovelScene(name="卫生间", environment_prompt="白瓷砖墙面。")
    scene = NovelScene(
        name="卫生间_漏水_夜晚",
        base_scene_id="卫生间",
        variant_id="漏水",
        time_of_day="夜晚",
        variant_prompt="地面积水。",
    )

    assert build_scene_effective_prompt(scene, base_scene) == (
        "[Base Scene Prompt]\n"
        "白瓷砖墙面。\n\n"
        "[Variant] 漏水\n\n"
        "[Variant Delta]\n"
        "地面积水。\n\n"
        "[Time-of-Day Plate]\n"
        "整体光照为夜晚时段；未声明改变的结构、陈设和材质继承基础场景。"
    )


def test_build_scene_effective_prompt_preserves_legacy_fused_prompt() -> None:
    scene = NovelScene(
        name="卫生间_漏水",
        base_scene_id="卫生间",
        environment_prompt="白瓷砖墙面，地面积水。",
    )

    assert build_scene_effective_prompt(scene) == "白瓷砖墙面，地面积水。"

from ai_anime.modules.asset_world.infrastructure.director_world.scene_360_builder import (
    build_prompt,
)


def test_scene_360_prompt_uses_text_only_project_style() -> None:
    prompt = build_prompt(
        scene_name="校园教室",
        scene_description="明亮的教室",
        style_preset={
            "style_instructions": "清爽二维动画线条与柔和彩色光照",
            "avoid_instructions": "写实摄影与厚重三维渲染",
            "style_reference_image_path": "/styles/reference.png",
        },
        has_master=False,
    )

    assert "No subject-bearing scene identity or geometry reference is attached" in prompt
    assert "text-only project style preset" in prompt
    assert "清爽二维动画线条与柔和彩色光照" in prompt
    assert "写实摄影与厚重三维渲染" in prompt
    assert "GLOBAL STYLE REFERENCE" not in prompt

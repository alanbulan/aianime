from ai_anime.modules.creative_canvas.domain.image_editing_prompts import (
    build_image_multi_view_prompt,
)


def test_multi_view_prompt_supports_extreme_close_up() -> None:
    prompt = build_image_multi_view_prompt(
        preset="custom",
        yaw_degrees=0.0,
        pitch_degrees=0.0,
        shot_size="extreme_close_up",
        prompt="",
    )

    assert "Shot size: extreme close-up." in prompt


def test_multi_view_prompt_supports_extreme_wide() -> None:
    prompt = build_image_multi_view_prompt(
        preset="custom",
        yaw_degrees=0.0,
        pitch_degrees=0.0,
        shot_size="extreme_wide",
        prompt="",
    )

    assert "Shot size: extreme wide shot." in prompt

from __future__ import annotations

from ai_anime.modules.creative_canvas.domain.skill_runs import (
    creative_canvas_skill_background_reference_mode,
)


def test_skill_background_reference_mode_accepts_supported_modes() -> None:
    assert (
        creative_canvas_skill_background_reference_mode(
            {"background_reference_mode": "scene_anchor"}
        )
        == "scene_anchor"
    )
    assert (
        creative_canvas_skill_background_reference_mode(
            {"background_reference_mode": "material_only"}
        )
        == "material_only"
    )


def test_skill_background_reference_mode_defaults_to_material_only() -> None:
    assert creative_canvas_skill_background_reference_mode({}) == "material_only"
    assert (
        creative_canvas_skill_background_reference_mode(
            {"background_reference_mode": "unsupported"}
        )
        == "material_only"
    )

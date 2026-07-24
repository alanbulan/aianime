from __future__ import annotations

from ai_anime.modules.production.public import (
    BRIDGMAN_CHARACTER_PALETTE,
    PROP_MARKER_PALETTE,
    assign_identity_sketch_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)


def _rgb_distance(left: str, right: str) -> float:
    left_red, left_green, left_blue = (
        int(left[index : index + 2], 16) for index in (1, 3, 5)
    )
    right_red, right_green, right_blue = (
        int(right[index : index + 2], 16) for index in (1, 3, 5)
    )
    return (
        (left_red - right_red) ** 2
        + (left_green - right_green) ** 2
        + (left_blue - right_blue) ** 2
    ) ** 0.5


def test_prop_marker_palette_stays_visually_separated_from_character_palette():
    prop_hexes = [hex_code for hex_code, _name in PROP_MARKER_PALETTE]
    character_hexes = [hex_code for hex_code, _name in BRIDGMAN_CHARACTER_PALETTE]

    assert "#E65100" not in prop_hexes
    assert "#4A148C" not in prop_hexes
    assert "#6D4C41" in prop_hexes
    assert "#7B1FA2" in prop_hexes
    assert min(
        _rgb_distance(prop_hex, character_hex)
        for prop_hex in prop_hexes
        for character_hex in character_hexes
    ) >= 80
    assert min(
        _rgb_distance(left, right)
        for index, left in enumerate(prop_hexes)
        for right in prop_hexes[index + 1 :]
    ) >= 55


def test_assign_sketch_colors_preserves_existing_when_identity_set_changes():
    existing = {
        "Hero_A": "#FF00FF FLUORESCENT MAGENTA",
        "Hero_Removed": "#00FFFF FLUORESCENT CYAN",
    }
    beats = [
        {"visual_description": "{{Hero_B}} enters"},
        {"visual_description": "{{Hero_A}} stays"},
    ]

    colors = assign_identity_sketch_colors(
        characters=[],
        episode_beats=beats,
        existing_colors=existing,
    )

    assert colors["Hero_A"] == "#FF00FF FLUORESCENT MAGENTA"
    assert colors["Hero_Removed"] == "#00FFFF FLUORESCENT CYAN"
    assert "Hero_B" in colors
    assert colors["Hero_B"] not in set(existing.values())


def test_prop_marker_colors_preserve_existing_when_prop_set_changes():
    beats = [
        {"visual_description": "男人抱起[[新道具]]，旁边没有旧道具。"},
    ]
    prop_menu = [
        {
            "prop_id": "旧道具",
            "is_global_asset": True,
            "marker_color": "#0D47A1 ROYAL BLUE",
        },
        {"prop_id": "新道具", "is_global_asset": True},
    ]

    colors = global_prop_marker_colors(
        beats,
        prop_menu=prop_menu,
        assign_missing=True,
    )

    assert colors["新道具"] != "#0D47A1 ROYAL BLUE"

    beats_with_old = [{"visual_description": "[[旧道具]] 和 [[新道具]] 同时出现。"}]
    colors_with_old = global_prop_marker_colors(
        beats_with_old,
        prop_menu=prop_menu,
        assign_missing=True,
    )
    assert colors_with_old["旧道具"] == "#0D47A1 ROYAL BLUE"


def test_incremental_color_assignment_does_not_force_full_sketch_clean():
    assert (
        marker_color_change_requires_sketch_clean(
            {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
            {
                "Hero_A": "#FF00FF FLUORESCENT MAGENTA",
                "Hero_B": "#00FFFF FLUORESCENT CYAN",
            },
        )
        is False
    )


def test_first_prop_after_existing_identity_does_not_force_full_sketch_clean():
    previous = {"identity:Hero_A": "#FF00FF FLUORESCENT MAGENTA"}
    current = {
        "identity:Hero_A": "#FF00FF FLUORESCENT MAGENTA",
        "prop:账单": "#0D47A1 ROYAL BLUE",
    }

    assert marker_color_change_requires_sketch_clean(previous, current) is False


def test_initial_or_changed_color_assignment_forces_full_sketch_clean():
    assert (
        marker_color_change_requires_sketch_clean(
            {},
            {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
        )
        is True
    )
    assert (
        marker_color_change_requires_sketch_clean(
            {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
            {"Hero_A": "#00FFFF FLUORESCENT CYAN"},
        )
        is True
    )

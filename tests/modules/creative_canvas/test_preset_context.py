from __future__ import annotations

from ai_anime.modules.creative_canvas.domain.preset_context import (
    as_preset_list,
    extract_preset_visual_markers,
    normalize_preset_scene_name,
    preset_identity_character,
    preset_identity_id,
    preset_identity_name,
    preset_prop_id,
    real_preset_identity_ids,
    real_preset_prop_ids,
    replace_preset_beat_markers,
)
from ai_anime.modules.creative_canvas.domain.preset_reference import PresetRef


def test_preset_context_normalizes_scene_and_reference_ids() -> None:
    assert normalize_preset_scene_name({"name": " 夜街 ", "id": "ignored"}) == "夜街"
    assert preset_identity_id({"identity_id": "林昭_常服", "id": "ignored"}) == "林昭_常服"
    assert preset_prop_id({"base_id": "账单", "id": "ignored"}) == "账单"


def test_preset_context_projects_character_and_identity_names() -> None:
    characters = ["林", "林昭"]
    assert preset_identity_character("林昭_常服", characters) == "林昭"
    assert preset_identity_name("林昭_常服", "林昭") == "常服"


def test_preset_context_extracts_markers_in_source_order() -> None:
    assert extract_preset_visual_markers("{{林昭_常服}}拿起[[账单]]，看向{{周牧野_默认}}") == (
        ["林昭_常服", "周牧野_默认"],
        ["账单"],
    )


def test_preset_context_filters_only_explicit_empty_markers() -> None:
    assert real_preset_identity_ids(["林昭_常服", "__NO_CHARACTER__", ""]) == [
        "林昭_常服"
    ]
    assert real_preset_prop_ids(["账单", "__NO_PROP__", ""]) == ["账单"]


def test_preset_context_preserves_list_coercion_contract() -> None:
    assert as_preset_list(("a", "b")) == ["a", "b"]
    assert as_preset_list(None) == []
    assert as_preset_list("a") == ["a"]


def test_preset_context_replaces_known_markers_and_unwraps_unknown_ones() -> None:
    result = replace_preset_beat_markers(
        "{{林昭_常服}}拿起[[账单]]，旁边是{{路人_默认}}和[[杯子]]",
        {
            "林昭_常服": {
                "tag": "[LIN_ZHAO]",
                "color_name": "red",
            }
        },
        {"账单": {"tag": "[BILL]", "marker_color": "blue"}},
    )
    assert result == "[LIN_ZHAO] (red)拿起[BILL] (blue)，旁边是路人_默认和杯子"


def test_preset_reference_projects_compact_mainline_context() -> None:
    payload = PresetRef(
        kind="character",
        role="character_identity",
        label="林昭常服",
        url="/assets/identity.png",
        meta={"character": "林昭", "identity_id": "林昭_常服", "episode": None},
    ).to_payload()

    assert payload["mainline_context"] == [
        {
            "kind": "identity",
            "character": "林昭",
            "identityId": "林昭_常服",
            "role": "character_identity",
            "label": "林昭常服",
            "sourceUrl": "/assets/identity.png",
        }
    ]

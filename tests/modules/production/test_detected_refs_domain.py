from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.production.domain.detected_refs import (
    NO_CHARACTER_MARKER,
    NO_PROP_MARKER,
    build_episode_identity_alias_map,
    canonicalize_visual_identity_markers,
    collect_prop_marker_ids_from_beat,
    extract_char_identities_from_markers,
    extract_prop_ids_from_markers,
    normalize_detected_identities,
    normalize_detected_props,
)


def test_detected_refs_normalization_deduplicates_and_prefers_real_ids() -> None:
    assert normalize_detected_identities(
        [NO_CHARACTER_MARKER, " Hero_Main ", "Hero_Main", ""],
    ) == ["Hero_Main"]
    assert normalize_detected_identities([NO_CHARACTER_MARKER]) == [
        NO_CHARACTER_MARKER
    ]
    assert normalize_detected_props(
        [NO_PROP_MARKER, " Prop_Global ", "Prop_Global", None],
    ) == ["Prop_Global"]
    assert normalize_detected_props([NO_PROP_MARKER]) == [NO_PROP_MARKER]


def test_marker_extraction_preserves_strict_character_and_prop_rules() -> None:
    assert extract_char_identities_from_markers(
        "{{Hero_Main}} meets {{Support_Young}} and {{Hero_Main}}",
    ) == {
        "Hero": "Hero_Main",
        "Support": "Support_Young",
    }
    assert extract_char_identities_from_markers(
        "{{Hero}}",
        strict=False,
    ) == {}
    with pytest.raises(ValueError, match="缺少身份后缀"):
        extract_char_identities_from_markers("{{Hero}}")

    assert extract_prop_ids_from_markers(
        "[[ Prop_Global ]] then [[Prop_Global]] and [[Prop_Local]]",
    ) == ["Prop_Global", "Prop_Local"]
    with pytest.raises(ValueError, match="不能为空"):
        extract_prop_ids_from_markers("[[ ]]", strict=True)


def test_collect_prop_markers_reads_dict_and_object_visual_description() -> None:
    assert collect_prop_marker_ids_from_beat(
        {"visual_description": "[[Prop_A]] [[Prop_A]] [[Prop_B]]"},
    ) == ["Prop_A", "Prop_B"]
    assert collect_prop_marker_ids_from_beat(
        SimpleNamespace(visual_description="[[Prop_C]]"),
    ) == ["Prop_C"]


def test_bare_character_names_are_canonicalized_to_episode_identity_ids() -> None:
    episode = SimpleNamespace(
        identity_ids=["林夏_常服", "周屿_校服"],
        identity_default_map={"林夏": "林夏_常服"},
    )
    characters = [
        SimpleNamespace(
            name="林夏",
            aliases=["小夏"],
            identities=[SimpleNamespace(identity_id="林夏_常服")],
        ),
        SimpleNamespace(
            name="周屿",
            aliases=[],
            identities=[SimpleNamespace(identity_id="周屿_校服")],
        ),
    ]

    aliases = build_episode_identity_alias_map(episode, characters)
    result = canonicalize_visual_identity_markers(
        "林夏与小夏看向周屿，已有{{林夏_常服}}，拿着[[手机]]。",
        aliases,
    )

    assert aliases == {
        "林夏": "林夏_常服",
        "小夏": "林夏_常服",
        "林夏_常服": "林夏_常服",
        "周屿": "周屿_校服",
        "周屿_校服": "周屿_校服",
    }
    assert result == (
        "{{林夏_常服}}与{{林夏_常服}}看向{{周屿_校服}}，"
        "已有{{林夏_常服}}，拿着[[手机]]。"
    )

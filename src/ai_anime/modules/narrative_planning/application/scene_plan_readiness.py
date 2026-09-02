"""Deterministic completeness checks for episode scene planning."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Iterable

from ai_anime.shared.utils.screenplay_scene_parser import parse_scene_blocks


@dataclass(frozen=True)
class EpisodeScenePlanReadiness:
    complete: bool
    expected_locations: tuple[str, ...]
    menu_scene_ids: tuple[str, ...]
    missing_locations: tuple[str, ...]


def _normalized_scene_name(value: Any) -> str:
    return re.sub(
        r"[\s·._\-—－/\\（）()【】\[\]，,。:：]+",
        "",
        str(value or "").strip().casefold(),
    )


def _episode_source_text(episode: Any) -> str:
    for field in ("beat_source_text", "adapted_content", "raw_content"):
        value = str(getattr(episode, field, "") or "").strip()
        if value:
            return value
    return ""


def inspect_episode_scene_plan(
    episode: Any,
    scenes: Iterable[Any] | None = None,
) -> EpisodeScenePlanReadiness:
    """Check that every deterministic source scene is represented in the menu.

    Narrated sources without explicit scene headings keep the historical
    ``menu is non-empty`` rule. Screenplays with parseable headings require
    full source-location coverage, including canonical scene aliases.
    """

    menu = tuple(getattr(episode, "scene_menu", None) or ())
    menu_scene_ids = tuple(
        dict.fromkeys(
            str(getattr(item, "scene_id", "") or "").strip()
            for item in menu
            if str(getattr(item, "scene_id", "") or "").strip()
        )
    )
    expected_locations = tuple(
        dict.fromkeys(
            block.location.strip()
            for block in parse_scene_blocks(_episode_source_text(episode))
            if block.location.strip()
        )
    )

    accepted_names: set[str] = set()
    menu_lookup: set[str] = set()
    for item in menu:
        for value in (
            getattr(item, "scene_id", ""),
            getattr(item, "base_scene_id", ""),
        ):
            normalized = _normalized_scene_name(value)
            if normalized:
                accepted_names.add(normalized)
                menu_lookup.add(normalized)

    for scene in scenes or ():
        scene_names = (
            str(getattr(scene, "name", "") or "").strip(),
            *(
                str(alias or "").strip()
                for alias in (getattr(scene, "aliases", None) or ())
            ),
        )
        normalized_names = {
            normalized
            for value in scene_names
            if (normalized := _normalized_scene_name(value))
        }
        if normalized_names & menu_lookup:
            accepted_names.update(normalized_names)

    missing_locations = tuple(
        location
        for location in expected_locations
        if _normalized_scene_name(location) not in accepted_names
    )
    return EpisodeScenePlanReadiness(
        complete=bool(menu_scene_ids) and not missing_locations,
        expected_locations=expected_locations,
        menu_scene_ids=menu_scene_ids,
        missing_locations=missing_locations,
    )

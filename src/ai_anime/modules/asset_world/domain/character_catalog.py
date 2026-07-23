"""Character catalog business rules."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


def other_main_character_names(
    characters: Iterable[Any],
    selected_name: str,
) -> tuple[str, ...]:
    """Return main characters that must be demoted for one selected narrator."""
    return tuple(
        character.name
        for character in characters
        if character.name != selected_name
        and bool(getattr(character, "is_main", False))
    )


def duplicate_main_character_names(characters: Iterable[Any]) -> tuple[str, ...]:
    """Keep the first narrator-main and return later legacy duplicates."""
    seen_main = False
    duplicates: list[str] = []
    for character in characters:
        if not bool(getattr(character, "is_main", False)):
            continue
        if not seen_main:
            seen_main = True
            continue
        duplicates.append(character.name)
    return tuple(duplicates)

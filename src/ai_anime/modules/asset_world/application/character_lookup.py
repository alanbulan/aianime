"""Shared character lookup rules for Asset & World application services."""

from __future__ import annotations

from typing import Any, Protocol

from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterNotFound,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    find_character_identity,
)


class CharacterLookup(Protocol):
    def get_character(self, name: str) -> Any | None: ...


def require_character(repository: CharacterLookup, character_name: str) -> Any:
    character = repository.get_character(character_name)
    if character is None:
        raise CharacterNotFound(f"Character '{character_name}' not found")
    return character


def require_character_identity(
    repository: CharacterLookup,
    character_name: str,
    identity_id: str,
) -> Any:
    character = require_character(repository, character_name)
    return require_identity(character, identity_id)


def require_identity(character: Any, identity_id: str) -> Any:
    identity = find_character_identity(character, identity_id)
    if identity is None:
        raise CharacterIdentityNotFound(f"Identity '{identity_id}' not found")
    return identity

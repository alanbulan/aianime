"""Rules shared by character and identity assets."""

from __future__ import annotations

from typing import Any

CHARACTER_ASSET_KINDS = frozenset(
    {"portrait", "identity", "identity_costume", "identity_portrait"}
)


def ensure_character_asset_kind(kind: str) -> None:
    if kind not in CHARACTER_ASSET_KINDS:
        raise ValueError(f"Unsupported character asset kind: {kind}")


def find_character_identity(character: Any, identity_id: str) -> Any | None:
    for identity in getattr(character, "identities", None) or []:
        if identity.identity_id == identity_id:
            return identity
    return None

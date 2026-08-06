"""Local adapters for character reference projection."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.generators.public import PromptComponents
from ai_anime.modules.production.public import (
    extract_char_identities_from_markers,
    real_detected_identities,
)
from ai_anime.utils.path_resolver import (
    compute_identity_portrait_path,
    compute_portrait_path,
)


class PromptCharacterReferenceSource:
    def character_names(
        self,
        beats: list[dict[str, Any]],
        known_character_names: list[str],
        *,
        use_detected_identities: bool,
    ) -> list[str]:
        known = {name: None for name in known_character_names if name}
        if not use_detected_identities:
            return PromptComponents.extract_panel_characters(beats, known)

        names: list[str] = []
        for beat in beats:
            for identity_id in real_detected_identities(
                beat.get("detected_identities") or []
            ):
                name = identity_id.split("_", 1)[0]
                if name in known and name not in names:
                    names.append(name)
        return names

    def identity_ids(
        self,
        beats: list[dict[str, Any]],
        character_name: str,
        *,
        use_detected_identities: bool,
    ) -> list[str]:
        identity_ids: list[str] = []
        for beat in beats:
            if use_detected_identities:
                candidates = real_detected_identities(
                    beat.get("detected_identities") or []
                )
            else:
                candidates = [
                    identity_id
                    for name, identity_id in extract_char_identities_from_markers(
                        beat.get("visual_description", ""),
                        strict=False,
                    ).items()
                    if name == character_name
                ]
            for identity_id in candidates:
                if (
                    identity_id.startswith(character_name + "_")
                    and identity_id not in identity_ids
                ):
                    identity_ids.append(identity_id)
        return identity_ids


class LocalCharacterReferenceAssets:
    def composite_identity_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> str:
        path = (
            project_dir
            / "assets"
            / "characters"
            / character_name
            / "identities"
            / f"{identity_name}.png"
        )
        return str(path) if path.exists() else ""

    def primary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str:
        computed = compute_identity_portrait_path(
            project_dir,
            character_name,
            identity_name,
        )
        return computed or self._existing_path(stored_path)

    def secondary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str:
        stored = self._existing_path(stored_path)
        if stored:
            return stored
        return compute_identity_portrait_path(
            project_dir,
            character_name,
            identity_name,
        )

    def character_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        stored_path: str | Path | None,
    ) -> str:
        return compute_portrait_path(
            project_dir,
            character_name,
        ) or self._existing_path(stored_path)

    @staticmethod
    def _existing_path(path: str | Path | None) -> str:
        if not path:
            return ""
        candidate = Path(path)
        return str(candidate) if candidate.exists() else ""

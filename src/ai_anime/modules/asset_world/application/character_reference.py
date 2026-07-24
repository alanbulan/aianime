"""Character reference projection for sketch and render grids."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.ports import (
    CharacterReferenceAssets,
    CharacterReferenceSource,
)
from ai_anime.modules.asset_world.domain.character_identity import (
    identity_name_from_id,
)


class CharacterReferenceUseCases:
    def __init__(
        self,
        source: CharacterReferenceSource,
        assets: CharacterReferenceAssets,
    ) -> None:
        self._source = source
        self._assets = assets

    def build_grid_character_map(
        self,
        *,
        beats: list[dict[str, Any]],
        characters: list[dict[str, Any]],
        project_dir: Path,
        sketch_colors: dict[str, str] | None = None,
        use_detected_identities: bool = False,
    ) -> dict[str, dict[str, Any]]:
        characters_by_name: dict[str, dict[str, Any]] = {}
        for character in characters:
            name = str(character.get("name") or "")
            if name:
                characters_by_name.setdefault(name, character)

        character_names = self._source.character_names(
            beats,
            list(characters_by_name),
            use_detected_identities=use_detected_identities,
        )
        return {
            character_name: self._project_character(
                character=characters_by_name[character_name],
                identity_ids=self._source.identity_ids(
                    beats,
                    character_name,
                    use_detected_identities=use_detected_identities,
                ),
                project_dir=project_dir,
                sketch_colors=sketch_colors,
            )
            for character_name in character_names
            if character_name in characters_by_name
        }

    def _project_character(
        self,
        *,
        character: dict[str, Any],
        identity_ids: list[str],
        project_dir: Path,
        sketch_colors: dict[str, str] | None,
    ) -> dict[str, Any]:
        character_name = str(character.get("name") or "")
        identities_by_id: dict[str, dict[str, Any]] = {}
        for identity in character.get("identities", []) or []:
            identity_id = str(identity.get("identity_id") or "")
            if identity_id:
                identities_by_id.setdefault(identity_id, identity)

        identity_appearances: dict[str, str] = {}
        identity_sketch_colors: dict[str, str] = {}
        for identity_id in identity_ids:
            identity = identities_by_id.get(identity_id)
            if identity is None:
                continue
            identity_name = identity_name_from_id(identity_id)
            identity_appearances[identity_name] = identity.get(
                "appearance_details", ""
            )
            sketch_color = (sketch_colors or {}).get(identity_id, "")
            if sketch_color:
                identity_sketch_colors[identity_name] = sketch_color

        primary_identity_id = identity_ids[0] if identity_ids else ""
        primary_identity_name = identity_name_from_id(primary_identity_id)
        primary_identity = identities_by_id.get(primary_identity_id)
        primary_face_prompt = (
            primary_identity.get("face_prompt", "") if primary_identity else ""
        )
        primary_body_type = (
            primary_identity.get("body_type", "") if primary_identity else ""
        )

        appearance_details = identity_appearances.get(primary_identity_name, "")
        if not appearance_details:
            appearance_details = character.get("appearance_details", "")

        reference_path = ""
        is_composite_identity = False
        if primary_identity_id:
            reference_path = self._assets.composite_identity_path(
                project_dir,
                character_name,
                primary_identity_name,
            )
            is_composite_identity = bool(reference_path)

        if not reference_path and primary_identity_id and primary_face_prompt:
            reference_path = self._assets.primary_identity_portrait_path(
                project_dir,
                character_name,
                primary_identity_name,
                primary_identity.get("portrait_image", "")
                if primary_identity
                else "",
            )

        if not reference_path and not primary_face_prompt:
            reference_path = self._assets.character_portrait_path(
                project_dir,
                character_name,
                character.get("portrait_path", ""),
            )

        identity_ref_images: dict[str, str] = {}
        identity_face_prompts: dict[str, str] = {}
        identity_body_types: dict[str, str] = {}
        for identity_id in identity_ids:
            if identity_id == primary_identity_id:
                continue
            identity = identities_by_id.get(identity_id)
            if identity is None:
                continue
            face_prompt = identity.get("face_prompt", "")
            if not face_prompt:
                continue
            identity_name = identity_name_from_id(identity_id)
            portrait_path = self._assets.secondary_identity_portrait_path(
                project_dir,
                character_name,
                identity_name,
                identity.get("portrait_image", ""),
            )
            if portrait_path:
                identity_ref_images[identity_name] = portrait_path
            else:
                identity_face_prompts[identity_name] = face_prompt
            body_type = identity.get("body_type", "")
            if body_type:
                identity_body_types[identity_name] = body_type

        if primary_body_type and primary_identity_name:
            identity_body_types[primary_identity_name] = primary_body_type

        effective_face_prompt = (
            primary_face_prompt
            or character.get("face_prompt", "")
            or character_name
        )
        reference_mode = (
            "composite"
            if is_composite_identity
            else ("portrait_only" if reference_path else "prompt_only")
        )
        return {
            "face_prompt": effective_face_prompt,
            "portrait_path": reference_path,
            "ref_path": reference_path,
            "base_prompt": effective_face_prompt,
            "reference_mode": reference_mode,
            "gender": character.get("gender", ""),
            "body_type": character.get("body_type", ""),
            "appearance_details": appearance_details,
            "identity_appearances": identity_appearances,
            "identity_sketch_colors": identity_sketch_colors,
            "sketch_color": identity_sketch_colors.get(primary_identity_name, ""),
            "identity_ref_images": identity_ref_images,
            "identity_face_prompts": identity_face_prompts,
            "identity_body_types": identity_body_types,
        }

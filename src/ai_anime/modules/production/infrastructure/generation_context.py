"""Adapters for Production generation context assembly."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.public import build_character_map_for_grid
from ai_anime.utils.path_resolver import compute_identity_path, compute_portrait_path


class CompatibleEpisodeSource:
    def episode_or_none(self, store: Any, episode_num: int) -> Any | None:
        get_episode = getattr(store, "get_episode", None)
        if get_episode is None:
            return None
        try:
            return get_episode(episode_num)
        except Exception:
            return None


class AssetWorldCharacterProjector:
    def __init__(self, user_output_dir: Path) -> None:
        self._user_output_dir = user_output_dir

    def project_characters(
        self,
        characters: list[Any],
        project: str,
    ) -> list[dict[str, Any]]:
        projected: list[dict[str, Any]] = []
        project_dir = self._user_output_dir / project
        for character in characters:
            projected.append(
                {
                    "name": character.name,
                    "gender": character.gender,
                    "body_type": getattr(character, "body_type", ""),
                    "role": character.role,
                    "is_main": getattr(character, "is_main", False),
                    "portrait_path": compute_portrait_path(
                        project_dir,
                        character.name,
                    ),
                    "face_prompt": character.face_prompt,
                    "appearance_details": character.appearance_details,
                    "identities": [
                        {
                            "identity_id": identity.identity_id,
                            "identity_name": identity.identity_name,
                            "appearance_details": identity.appearance_details,
                            "face_prompt": identity.face_prompt,
                            "body_type": identity.body_type,
                            "fish_voice_id": identity.fish_voice_id,
                            "age_group": identity.age_group,
                            "portrait_image": identity.portrait_image,
                            "costume_image": identity.costume_image,
                            "primary_reference": compute_identity_path(
                                project_dir,
                                character.name,
                                identity.identity_name,
                            ),
                            "character_tag": identity.character_tag,
                            "source": identity.source,
                        }
                        for identity in (character.identities or [])
                    ],
                }
            )
        return projected

    def build_character_map(
        self,
        *,
        beats: list[dict[str, Any]],
        characters: list[dict[str, Any]],
        project: str,
        sketch_colors: dict[str, str] | None,
        use_detected_identities: bool,
    ) -> dict[str, dict[str, Any]]:
        return build_character_map_for_grid(
            grid_beats=beats,
            characters=characters,
            user_output_dir=self._user_output_dir,
            project=project,
            sketch_colors=sketch_colors,
            use_detected_identities=use_detected_identities,
        )

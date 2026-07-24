from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.character_reference import (
    CharacterReferenceUseCases,
)
from ai_anime.modules.asset_world.infrastructure.character_reference import (
    PromptCharacterReferenceSource,
)


class _Source:
    def __init__(
        self,
        character_names: list[str],
        identity_ids: dict[str, list[str]],
    ) -> None:
        self._character_names = character_names
        self._identity_ids = identity_ids

    def character_names(
        self,
        beats: list[dict[str, Any]],
        known_character_names: list[str],
        *,
        use_detected_identities: bool,
    ) -> list[str]:
        return list(self._character_names)

    def identity_ids(
        self,
        beats: list[dict[str, Any]],
        character_name: str,
        *,
        use_detected_identities: bool,
    ) -> list[str]:
        return list(self._identity_ids.get(character_name, []))


class _Assets:
    def __init__(self) -> None:
        self.composite: dict[tuple[str, str], str] = {}
        self.primary_portraits: dict[tuple[str, str], str] = {}
        self.secondary_portraits: dict[tuple[str, str], str] = {}
        self.character_portraits: dict[str, str] = {}
        self.character_portrait_calls: list[str] = []

    def composite_identity_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> str:
        return self.composite.get((character_name, identity_name), "")

    def primary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str:
        return self.primary_portraits.get((character_name, identity_name), "")

    def secondary_identity_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
        stored_path: str | Path | None,
    ) -> str:
        return self.secondary_portraits.get((character_name, identity_name), "")

    def character_portrait_path(
        self,
        project_dir: Path,
        character_name: str,
        stored_path: str | Path | None,
    ) -> str:
        self.character_portrait_calls.append(character_name)
        return self.character_portraits.get(character_name, "")


def test_grid_character_map_projects_primary_and_secondary_identities(
    tmp_path: Path,
) -> None:
    source = _Source(
        ["林澜"],
        {"林澜": ["林澜_少年", "林澜_成年"]},
    )
    assets = _Assets()
    assets.composite[("林澜", "少年")] = "primary-composite.png"
    assets.secondary_portraits[("林澜", "成年")] = "adult-portrait.png"
    use_cases = CharacterReferenceUseCases(source, assets)

    result = use_cases.build_grid_character_map(
        beats=[{"visual_description": "{{林澜_少年}}"}],
        characters=[
            {
                "name": "林澜",
                "gender": "female",
                "body_type": "slim",
                "face_prompt": "base face",
                "appearance_details": "base appearance",
                "identities": [
                    {
                        "identity_id": "林澜_少年",
                        "appearance_details": "young appearance",
                        "face_prompt": "young face",
                        "body_type": "young body",
                    },
                    {
                        "identity_id": "林澜_成年",
                        "appearance_details": "adult appearance",
                        "face_prompt": "adult face",
                        "body_type": "adult body",
                    },
                ],
            }
        ],
        project_dir=tmp_path,
        sketch_colors={
            "林澜_少年": "#112233",
            "林澜_成年": "#445566",
        },
    )

    projected = result["林澜"]
    assert projected["reference_mode"] == "composite"
    assert projected["portrait_path"] == "primary-composite.png"
    assert projected["ref_path"] == "primary-composite.png"
    assert projected["face_prompt"] == "young face"
    assert projected["appearance_details"] == "young appearance"
    assert projected["identity_appearances"] == {
        "少年": "young appearance",
        "成年": "adult appearance",
    }
    assert projected["identity_sketch_colors"] == {
        "少年": "#112233",
        "成年": "#445566",
    }
    assert projected["sketch_color"] == "#112233"
    assert projected["identity_ref_images"] == {
        "成年": "adult-portrait.png"
    }
    assert projected["identity_face_prompts"] == {}
    assert projected["identity_body_types"] == {
        "少年": "young body",
        "成年": "adult body",
    }


def test_primary_face_prompt_does_not_fall_back_to_character_portrait(
    tmp_path: Path,
) -> None:
    source = _Source(
        ["林澜"],
        {"林澜": ["林澜_少年", "林澜_成年"]},
    )
    assets = _Assets()
    assets.character_portraits["林澜"] = "base-portrait.png"
    use_cases = CharacterReferenceUseCases(source, assets)

    result = use_cases.build_grid_character_map(
        beats=[],
        characters=[
            {
                "name": "林澜",
                "appearance_details": "base appearance",
                "identities": [
                    {
                        "identity_id": "林澜_少年",
                        "face_prompt": "young face",
                    },
                    {
                        "identity_id": "林澜_成年",
                        "face_prompt": "adult face",
                    },
                ],
            }
        ],
        project_dir=tmp_path,
    )

    projected = result["林澜"]
    assert projected["reference_mode"] == "prompt_only"
    assert projected["portrait_path"] == ""
    assert projected["identity_face_prompts"] == {"成年": "adult face"}
    assert assets.character_portrait_calls == []


def test_prompt_source_keeps_sketch_and_render_identity_sources_separate() -> None:
    source = PromptCharacterReferenceSource()
    beats = [
        {
            "visual_description": "{{沈知薇_千岁府时期}}",
            "detected_identities": ["沈知月_怀孕时期"],
        }
    ]
    names = ["沈知月", "沈知薇"]

    assert source.character_names(
        beats,
        names,
        use_detected_identities=False,
    ) == ["沈知薇"]
    assert source.identity_ids(
        beats,
        "沈知薇",
        use_detected_identities=False,
    ) == ["沈知薇_千岁府时期"]
    assert source.character_names(
        beats,
        names,
        use_detected_identities=True,
    ) == ["沈知月"]
    assert source.identity_ids(
        beats,
        "沈知月",
        use_detected_identities=True,
    ) == ["沈知月_怀孕时期"]

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.character_catalog import (
    CharacterCatalogUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    CreateCharacterCommand,
    UpdateCharacterCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAlreadyExists,
    CharacterNotFound,
    InvalidCharacterInput,
)


@dataclass
class _Identity:
    identity_id: str
    identity_name: str


@dataclass
class _Character:
    name: str
    role: str = ""
    is_main: bool = False
    gender: str = ""
    age_group: str = "youth"
    body_type: str = ""
    description: str = ""
    face_prompt: str = ""
    aliases: list[str] = field(default_factory=list)
    updated_at: str = ""
    reference_audio_path: str = ""
    reference_audio_sha256: str = ""
    reference_audio_updated_at: str = ""
    voice_samples_by_age_group: dict = field(default_factory=dict)
    identities: list[_Identity] = field(default_factory=list)


class _Repository:
    def __init__(self, characters: list[_Character] | None = None) -> None:
        self.characters = {character.name: character for character in characters or []}

    def get_all_characters(self) -> list[_Character]:
        return list(self.characters.values())

    def get_character(self, name: str) -> _Character | None:
        return self.characters.get(name)

    async def add_character(self, character: _Character) -> None:
        self.characters[character.name] = character

    async def update_character(self, name: str, **updates) -> None:
        character = self.characters[name]
        for key, value in updates.items():
            setattr(character, key, value)

    async def rename_character(self, old_name: str, new_name: str) -> None:
        character = self.characters.pop(old_name)
        character.name = new_name
        self.characters[new_name] = character

    async def delete_character(self, name: str) -> None:
        self.characters.pop(name)


class _Factory:
    def create(self, command: CreateCharacterCommand) -> _Character:
        return _Character(**command.__dict__)


class _Assets:
    def portrait_path(self, project_dir: Path, character_name: str) -> str:
        return str(
            project_dir / "assets" / "characters" / character_name / "portrait.png"
        )

    def updated_at(self, project_dir: Path, character: _Character) -> str:
        return character.updated_at or "2026-07-23T00:00:00Z"


def _use_cases() -> CharacterCatalogUseCases:
    return CharacterCatalogUseCases(_Factory(), _Assets())


@pytest.mark.asyncio
async def test_list_repairs_duplicate_main_and_projects_catalog_fields(
    tmp_path: Path,
) -> None:
    first = _Character(name="陆辰", is_main=True)
    duplicate = _Character(
        name="沈月白",
        is_main=True,
        identities=[_Identity(identity_id="shen_youth", identity_name="青年")],
        reference_audio_path="assets/characters/沈月白/voices/voice_default.wav",
        reference_audio_sha256="voice-sha",
    )
    repository = _Repository([first, duplicate])

    data = await _use_cases().list_characters(
        repository=repository,
        project_dir=tmp_path,
        asset_project="project-id",
        asset_url=lambda path: f"/media/{Path(path).name}",
    )

    assert [item["name"] for item in data if item["is_main"]] == ["陆辰"]
    assert duplicate.is_main is False
    assert data[1]["reference_audio_url"] == "/media/voice_default.wav"
    assert data[1]["reference_audio_sha256"] == "voice-sha"
    assert data[1]["identities"] == [
        {"identity_id": "shen_youth", "identity_name": "青年"}
    ]
    assert data[1]["history_url"] == (
        "/api/v1/projects/project-id/characters/"
        "%E6%B2%88%E6%9C%88%E7%99%BD/asset-history?kind=portrait"
    )


@pytest.mark.asyncio
async def test_create_main_character_demotes_previous_main() -> None:
    previous = _Character(name="旧主角", is_main=True)
    repository = _Repository([previous])

    data = await _use_cases().create_character(
        repository=repository,
        command=CreateCharacterCommand(
            name="新主角",
            role="主角",
            is_main=True,
            gender="女",
        ),
    )

    assert previous.is_main is False
    assert data == {
        "name": "新主角",
        "role": "主角",
        "is_main": True,
        "gender": "女",
        "age_group": "youth",
        "description": "",
        "face_prompt": "",
    }


@pytest.mark.asyncio
async def test_create_rejects_duplicate_name() -> None:
    repository = _Repository([_Character(name="秦昭")])

    with pytest.raises(CharacterAlreadyExists, match="already exists"):
        await _use_cases().create_character(
            repository=repository,
            command=CreateCharacterCommand(name="秦昭"),
        )


@pytest.mark.asyncio
async def test_update_can_rename_and_preserves_updated_field_order() -> None:
    repository = _Repository([_Character(name="秦昭")])

    data = await _use_cases().update_character(
        repository=repository,
        character_name="秦昭",
        command=UpdateCharacterCommand(
            fields={"name": "秦照", "face_prompt": "calm eyes"}
        ),
    )

    assert data == {
        "name": "秦照",
        "updated_fields": ["name", "face_prompt"],
        "renamed_from": "秦昭",
    }
    assert repository.get_character("秦照").face_prompt == "calm eyes"


@pytest.mark.asyncio
async def test_update_rejects_empty_name_and_supports_noop() -> None:
    repository = _Repository([_Character(name="秦昭")])

    with pytest.raises(InvalidCharacterInput, match="cannot be empty"):
        await _use_cases().update_character(
            repository=repository,
            character_name="秦昭",
            command=UpdateCharacterCommand(fields={"name": "  "}),
        )

    data = await _use_cases().update_character(
        repository=repository,
        character_name="秦昭",
        command=UpdateCharacterCommand(fields={}),
    )
    assert data == {"message": "No fields to update"}


@pytest.mark.asyncio
async def test_delete_rejects_missing_character_and_deletes_existing() -> None:
    repository = _Repository([_Character(name="秦昭")])

    with pytest.raises(CharacterNotFound, match="not found"):
        await _use_cases().delete_character(
            repository=repository,
            character_name="不存在",
        )

    data = await _use_cases().delete_character(
        repository=repository,
        character_name="秦昭",
    )
    assert data == {"name": "秦昭", "deleted": True}
    assert repository.get_character("秦昭") is None

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.character_identity import (
    CharacterIdentityUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    CreateIdentityCommand,
    IdentityAssetPaths,
    ImportCharacterIdentityAssetCommand,
    ImportedCharacterIdentityAsset,
    UpdateIdentityCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterNotFound,
    InvalidCharacterInput,
)
from ai_anime.modules.asset_world.domain.character_identity import identity_id_for


@dataclass
class _Identity:
    identity_id: str
    character_name: str
    identity_name: str
    appearance_details: str = ""
    face_prompt: str = ""
    age_group: str = ""
    body_type: str = ""
    source: str = "api"
    updated_at: str = ""
    reference_audio_path: str = ""
    reference_audio_sha256: str = ""
    reference_audio_updated_at: str = ""


@dataclass
class _Character:
    name: str
    identities: list[_Identity] = field(default_factory=list)
    updated_at: str = ""


class _Repository:
    def __init__(self, characters: list[_Character] | None = None) -> None:
        self.characters = {
            character.name: character for character in characters or []
        }
        self.updated: list[tuple[str, str, dict]] = []
        self.deleted: list[tuple[str, str]] = []
        self.reject_add = False

    def get_all_characters(self) -> list[_Character]:
        return list(self.characters.values())

    def get_character(self, name: str) -> _Character | None:
        return self.characters.get(name)

    async def add_character_identity(
        self,
        character_name: str,
        identity: _Identity,
    ) -> None:
        if self.reject_add:
            raise ValueError(f"身份 {identity.identity_id} 已存在")
        self.characters[character_name].identities.append(identity)

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates,
    ) -> None:
        self.updated.append((character_name, identity_id, updates))

    async def delete_character_identity(
        self,
        character_name: str,
        identity_id: str,
    ) -> None:
        self.deleted.append((character_name, identity_id))


class _Factory:
    def create(
        self,
        character_name: str,
        command: CreateIdentityCommand,
    ) -> _Identity:
        return _Identity(
            identity_id=identity_id_for(character_name, command.identity_name),
            character_name=character_name,
            identity_name=command.identity_name,
            age_group=command.age_group,
            appearance_details=command.appearance_details,
            face_prompt=command.face_prompt,
            source=command.source,
        )


class _Assets:
    def paths(
        self,
        project_dir: Path,
        character_name: str,
        identity_name: str,
    ) -> IdentityAssetPaths:
        root = project_dir / "assets" / "characters" / character_name / "identities"
        return IdentityAssetPaths(
            image=str(root / f"{identity_name}.png"),
            costume=str(root / f"{identity_name}_costume.png"),
            portrait=str(root / f"{character_name}_{identity_name}_portrait.png"),
        )

    def updated_at(
        self,
        character: _Character,
        identity: _Identity,
        paths: IdentityAssetPaths,
    ) -> str:
        return identity.updated_at or character.updated_at or "2026-07-23T00:00:00Z"


class _AssetImporter:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def import_asset(self, **kwargs) -> ImportedCharacterIdentityAsset:
        self.calls.append(kwargs)
        return ImportedCharacterIdentityAsset(
            target_path=kwargs["project_dir"] / "identity.png",
            target_url="/media/identity.png",
        )


def _use_cases(
    asset_importer: _AssetImporter | None = None,
) -> CharacterIdentityUseCases:
    return CharacterIdentityUseCases(
        _Factory(),
        _Assets(),
        asset_importer or _AssetImporter(),
    )


def test_list_projects_identity_assets_history_and_voice(tmp_path: Path) -> None:
    identity = _Identity(
        identity_id="林昭_青年",
        character_name="林昭",
        identity_name="青年",
        appearance_details="青衣佩剑",
        reference_audio_path="assets/characters/林昭/identities/青年_voice.wav",
        reference_audio_sha256="voice-sha",
    )
    repository = _Repository([_Character(name="林昭", identities=[identity])])

    data = _use_cases().list_identities(
        repository=repository,
        character_name="林昭",
        project_dir=tmp_path,
        asset_project="project-id",
        asset_url=lambda path: f"/media/{Path(path).name}",
    )

    assert data[0]["identity_id"] == "林昭_青年"
    assert data[0]["image_url"] == "/media/青年.png"
    assert data[0]["costume_image_url"] == "/media/青年_costume.png"
    assert data[0]["portrait_image_url"] == "/media/林昭_青年_portrait.png"
    assert data[0]["reference_audio_url"] == "/media/青年_voice.wav"
    assert data[0]["reference_audio_sha256"] == "voice-sha"
    assert data[0]["history_url"] == (
        "/api/v1/projects/project-id/characters/"
        "%E6%9E%97%E6%98%AD/asset-history?"
        "kind=identity&identity_id=%E6%9E%97%E6%98%AD_%E9%9D%92%E5%B9%B4"
    )


def test_list_uses_exact_character_name() -> None:
    repository = _Repository([_Character(name="林昭")])

    with pytest.raises(CharacterNotFound, match="not found"):
        _use_cases().list_identities(
            repository=repository,
            character_name="林昭别名",
            project_dir=Path("project"),
            asset_project="project-id",
            asset_url=lambda path: str(path),
        )


@pytest.mark.asyncio
async def test_create_identity_returns_request_contract() -> None:
    character = _Character(name="秦")
    repository = _Repository([character])

    data = await _use_cases().create_identity(
        repository=repository,
        character_name="秦",
        command=CreateIdentityCommand(
            identity_name="幼年",
            age_group="child",
            appearance_details="粗布短衫",
        ),
    )

    assert data == {
        "identity_id": "秦_幼年",
        "identity_name": "幼年",
        "age_group": "child",
        "appearance_details": "粗布短衫",
    }
    assert character.identities[0].source == "api"


@pytest.mark.asyncio
async def test_create_identity_preserves_repository_duplicate_error() -> None:
    repository = _Repository([_Character(name="秦")])
    repository.reject_add = True

    with pytest.raises(ValueError, match="已存在"):
        await _use_cases().create_identity(
            repository=repository,
            character_name="秦",
            command=CreateIdentityCommand(identity_name="幼年"),
        )


@pytest.mark.asyncio
async def test_import_identity_asset_normalizes_fields_and_uses_freezone_source(
    tmp_path: Path,
) -> None:
    importer = _AssetImporter()
    use_cases = _use_cases(importer)

    data = await use_cases.import_asset(
        context=object(),
        project_dir=tmp_path,
        command=ImportCharacterIdentityAssetCommand(
            source_url="/static/project/upload.png",
            character_name=" 秦 ",
            identity_name=" 雨夜 ",
            appearance_details=" 湿发青衣 ",
            face_prompt=" 冷峻 ",
            age_group=" youth ",
        ),
    )

    assert data == {
        "character": "秦",
        "identity_id": "秦_雨夜",
        "identity_name": "雨夜",
        "target_path": str(tmp_path / "identity.png"),
        "target_url": "/media/identity.png",
    }
    identity = importer.calls[0]["identity"]
    assert identity.appearance_details == "湿发青衣"
    assert identity.face_prompt == "冷峻"
    assert identity.age_group == "youth"
    assert identity.source == "freezone"


@pytest.mark.asyncio
async def test_import_identity_asset_rejects_blank_names(tmp_path: Path) -> None:
    use_cases = _use_cases()

    with pytest.raises(InvalidCharacterInput, match="character is required"):
        await use_cases.import_asset(
            context=object(),
            project_dir=tmp_path,
            command=ImportCharacterIdentityAssetCommand(
                source_url="/static/project/upload.png",
                character_name=" ",
                identity_name="雨夜",
            ),
        )


@pytest.mark.asyncio
async def test_update_identity_supports_noop_and_preserves_field_order() -> None:
    repository = _Repository([_Character(name="秦")])

    noop = await _use_cases().update_identity(
        repository=repository,
        character_name="秦",
        identity_id="秦_幼年",
        command=UpdateIdentityCommand(fields={}),
    )
    updated = await _use_cases().update_identity(
        repository=repository,
        character_name="秦",
        identity_id="秦_幼年",
        command=UpdateIdentityCommand(
            fields={"identity_name": "少年", "age_group": "youth"}
        ),
    )

    assert noop == {"message": "No fields to update"}
    assert updated == {
        "identity_id": "秦_幼年",
        "updated_fields": ["identity_name", "age_group"],
    }
    assert repository.updated == [
        ("秦", "秦_幼年", {"identity_name": "少年", "age_group": "youth"})
    ]


@pytest.mark.asyncio
async def test_delete_identity_checks_character_and_returns_existing_contract() -> None:
    repository = _Repository([_Character(name="秦")])

    with pytest.raises(CharacterNotFound, match="not found"):
        await _use_cases().delete_identity(
            repository=repository,
            character_name="不存在",
            identity_id="不存在_幼年",
        )

    data = await _use_cases().delete_identity(
        repository=repository,
        character_name="秦",
        identity_id="秦_幼年",
    )
    assert data == {"identity_id": "秦_幼年", "message": "身份已删除"}
    assert repository.deleted == [("秦", "秦_幼年")]

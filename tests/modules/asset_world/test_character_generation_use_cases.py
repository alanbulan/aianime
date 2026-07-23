from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from ai_anime.modules.asset_world.application.character_generation import (
    CharacterGenerationUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    CharacterGenerationOptions,
    IdentityGenerationAssets,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterImageGenerationRejected,
    CharacterNotFound,
)


@dataclass
class _Identity:
    identity_id: str
    identity_name: str
    appearance_details: str = ""
    face_prompt: str = ""
    age_group: str = ""
    character_tag: str = ""


@dataclass
class _Character:
    name: str
    face_prompt: str = ""
    age_group: str = "youth"
    identities: list[_Identity] = field(default_factory=list)


class _Repository:
    def __init__(self, characters: list[_Character] | None = None) -> None:
        self.characters = {
            character.name: character for character in characters or []
        }
        self.identity_updates: list[tuple[str, str, dict[str, Any]]] = []

    def get_character(self, name: str) -> _Character | None:
        return self.characters.get(name)

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates: Any,
    ) -> None:
        self.identity_updates.append((character_name, identity_id, updates))


class _Gateway:
    def __init__(self, project_dir: Path) -> None:
        self.character_portrait_target: Path | None = project_dir / "portrait.png"
        self.identity_portrait_target: Path | None = project_dir / "identity_portrait.png"
        self.identity_output = project_dir / "identity.png"
        self.identity_result: Any = True
        self.assets = IdentityGenerationAssets(
            costume_image="",
            identity_portrait="",
            character_portrait=str(project_dir / "portrait.png"),
            has_costume_image=False,
            has_identity_portrait=False,
        )
        self.events: list[str] = []
        self.character_portrait_call: dict[str, Any] | None = None
        self.identity_portrait_call: dict[str, Any] | None = None
        self.identity_image_call: dict[str, Any] | None = None

    async def generate_character_portrait(self, **kwargs: Any) -> Path | None:
        self.events.append("generate_character_portrait")
        self.character_portrait_call = kwargs
        return self.character_portrait_target

    async def generate_identity_portrait(self, **kwargs: Any) -> Path | None:
        self.events.append("generate_identity_portrait")
        self.identity_portrait_call = kwargs
        return self.identity_portrait_target

    def resolve_identity_assets(self, **_kwargs: Any) -> IdentityGenerationAssets:
        self.events.append("resolve_identity_assets")
        return self.assets

    def prepare_identity_image_output(self, **_kwargs: Any) -> Path:
        self.events.append("prepare_identity_image_output")
        return self.identity_output

    async def generate_identity_image(self, **kwargs: Any) -> Any:
        self.events.append("generate_identity_image")
        self.identity_image_call = kwargs
        return self.identity_result


def _identity(
    *,
    age_group: str = "",
    appearance_details: str = "青衣佩剑",
    face_prompt: str = "清秀少年面容",
) -> _Identity:
    return _Identity(
        identity_id="秦_少年",
        identity_name="少年",
        age_group=age_group,
        appearance_details=appearance_details,
        face_prompt=face_prompt,
        character_tag="[Qin]",
    )


def _repository(identity: _Identity | None = None) -> _Repository:
    identities = [] if identity is None else [identity]
    return _Repository(
        [
            _Character(
                name="秦",
                face_prompt="角色面容",
                age_group="youth",
                identities=identities,
            )
        ]
    )


def _options(events: list[str] | None = None) -> CharacterGenerationOptions:
    if events is not None:
        events.append("options")
    return CharacterGenerationOptions(
        style="period-drama",
        ethnicity="Chinese",
        model="image-model",
    )


def _asset_url(path: str | Path) -> str:
    return f"/media/{Path(path).name}"


@pytest.mark.asyncio
async def test_generate_character_portrait_returns_url_and_passes_options(
    tmp_path: Path,
) -> None:
    gateway = _Gateway(tmp_path)
    use_cases = CharacterGenerationUseCases(gateway)

    data = await use_cases.generate_character_portrait(
        repository=_repository(),
        project_dir=tmp_path,
        output_dir=tmp_path / "output",
        character_name="秦",
        options=_options,
        asset_url=_asset_url,
    )

    assert data == {"portrait_url": "/media/portrait.png"}
    assert gateway.character_portrait_call == {
        "character": _repository().get_character("秦"),
        "project_dir": tmp_path,
        "output_dir": tmp_path / "output",
        "options": _options(),
    }


@pytest.mark.asyncio
async def test_generate_character_portrait_rejects_empty_generator_result(
    tmp_path: Path,
) -> None:
    gateway = _Gateway(tmp_path)
    gateway.character_portrait_target = None

    with pytest.raises(
        CharacterImageGenerationRejected,
        match="Portrait generation failed",
    ):
        await CharacterGenerationUseCases(gateway).generate_character_portrait(
            repository=_repository(),
            project_dir=tmp_path,
            output_dir=tmp_path,
            character_name="秦",
            options=_options,
            asset_url=_asset_url,
        )


@pytest.mark.asyncio
async def test_character_portrait_validates_character_before_loading_options(
    tmp_path: Path,
) -> None:
    gateway = _Gateway(tmp_path)
    events: list[str] = []

    with pytest.raises(CharacterNotFound, match="Character '不存在' not found"):
        await CharacterGenerationUseCases(gateway).generate_character_portrait(
            repository=_Repository(),
            project_dir=tmp_path,
            output_dir=tmp_path,
            character_name="不存在",
            options=lambda: _options(events),
            asset_url=_asset_url,
        )

    assert events == []
    assert gateway.events == []


@pytest.mark.asyncio
async def test_generate_identity_portrait_syncs_path_to_repository(
    tmp_path: Path,
) -> None:
    identity = _identity()
    repository = _repository(identity)
    gateway = _Gateway(tmp_path)

    data = await CharacterGenerationUseCases(gateway).generate_identity_portrait(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id=identity.identity_id,
        options=_options,
        asset_url=_asset_url,
    )

    assert data == {"portrait_image_url": "/media/identity_portrait.png"}
    assert repository.identity_updates == [
        (
            "秦",
            "秦_少年",
            {"portrait_image": str(gateway.identity_portrait_target)},
        )
    ]
    assert gateway.identity_portrait_call is not None
    assert gateway.identity_portrait_call["identity"] is identity
    assert gateway.identity_portrait_call["options"] == _options()


@pytest.mark.asyncio
async def test_identity_portrait_rejects_missing_face_prompt_before_options(
    tmp_path: Path,
) -> None:
    identity = _identity(face_prompt="")
    gateway = _Gateway(tmp_path)
    events: list[str] = []

    with pytest.raises(CharacterImageGenerationRejected, match="无 face_prompt"):
        await CharacterGenerationUseCases(gateway).generate_identity_portrait(
            repository=_repository(identity),
            project_dir=tmp_path,
            character_name="秦",
            identity_id=identity.identity_id,
            options=lambda: _options(events),
            asset_url=_asset_url,
        )

    assert events == []
    assert gateway.events == []


@pytest.mark.asyncio
async def test_identity_portrait_rejects_empty_generator_result(
    tmp_path: Path,
) -> None:
    identity = _identity()
    gateway = _Gateway(tmp_path)
    gateway.identity_portrait_target = None

    with pytest.raises(CharacterImageGenerationRejected, match="身份 Portrait 生成失败"):
        await CharacterGenerationUseCases(gateway).generate_identity_portrait(
            repository=_repository(identity),
            project_dir=tmp_path,
            character_name="秦",
            identity_id=identity.identity_id,
            options=_options,
            asset_url=_asset_url,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["character", "identity"])
async def test_identity_generation_validates_lookup_before_options(
    tmp_path: Path,
    missing: str,
) -> None:
    gateway = _Gateway(tmp_path)
    events: list[str] = []
    repository = _Repository() if missing == "character" else _repository()
    expected_error = CharacterNotFound if missing == "character" else CharacterIdentityNotFound

    with pytest.raises(expected_error):
        await CharacterGenerationUseCases(gateway).generate_identity_image(
            repository=repository,
            project_dir=tmp_path,
            character_name="秦",
            identity_id="秦_少年",
            options=lambda: _options(events),
            asset_url=_asset_url,
        )

    assert events == []
    assert gateway.events == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("has_identity_portrait", "has_costume_image", "expected_prompt"),
    [
        (True, True, ""),
        (True, False, "青衣佩剑"),
        (False, True, "清秀少年面容"),
        (False, False, "清秀少年面容\n青衣佩剑"),
    ],
)
async def test_age_variant_combines_available_identity_references(
    tmp_path: Path,
    has_identity_portrait: bool,
    has_costume_image: bool,
    expected_prompt: str,
) -> None:
    identity = _identity(age_group="child")
    gateway = _Gateway(tmp_path)
    gateway.assets = IdentityGenerationAssets(
        costume_image=str(tmp_path / "costume.png"),
        identity_portrait=str(tmp_path / "identity_portrait.png"),
        character_portrait="",
        has_costume_image=has_costume_image,
        has_identity_portrait=has_identity_portrait,
    )

    data = await CharacterGenerationUseCases(gateway).generate_identity_image(
        repository=_repository(identity),
        project_dir=tmp_path,
        character_name="秦",
        identity_id=identity.identity_id,
        options=_options,
        asset_url=_asset_url,
    )

    assert data == {"image_url": "/media/identity.png"}
    assert gateway.identity_image_call is not None
    assert gateway.identity_image_call["identity_prompt"] == expected_prompt
    assert gateway.identity_image_call["reference_image_path"] == (
        str(tmp_path / "identity_portrait.png")
        if has_identity_portrait
        else ""
    )
    assert gateway.identity_image_call["costume_image_path"] == (
        str(tmp_path / "costume.png") if has_costume_image else ""
    )


@pytest.mark.asyncio
async def test_regular_identity_requires_character_portrait_after_output_preparation(
    tmp_path: Path,
) -> None:
    identity = _identity()
    gateway = _Gateway(tmp_path)
    gateway.assets = IdentityGenerationAssets(
        costume_image="",
        identity_portrait="",
        character_portrait="",
        has_costume_image=False,
        has_identity_portrait=False,
    )

    with pytest.raises(CharacterImageGenerationRejected, match="Generate portrait first"):
        await CharacterGenerationUseCases(gateway).generate_identity_image(
            repository=_repository(identity),
            project_dir=tmp_path,
            character_name="秦",
            identity_id=identity.identity_id,
            options=lambda: _options(gateway.events),
            asset_url=_asset_url,
        )

    assert gateway.events == [
        "resolve_identity_assets",
        "prepare_identity_image_output",
        "options",
    ]


@pytest.mark.asyncio
async def test_identity_output_is_prepared_before_options_are_loaded(
    tmp_path: Path,
) -> None:
    identity = _identity(age_group="child")
    gateway = _Gateway(tmp_path)

    await CharacterGenerationUseCases(gateway).generate_identity_image(
        repository=_repository(identity),
        project_dir=tmp_path,
        character_name="秦",
        identity_id=identity.identity_id,
        options=lambda: _options(gateway.events),
        asset_url=_asset_url,
    )

    assert gateway.events == [
        "resolve_identity_assets",
        "prepare_identity_image_output",
        "options",
        "generate_identity_image",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("result", "expected_error"),
    [
        (True, None),
        ({"success": True}, None),
        (False, "Identity image generation failed"),
        ({"success": False, "error": "provider failed"}, "provider failed"),
    ],
)
async def test_identity_image_accepts_bool_and_mapping_results(
    tmp_path: Path,
    result: Any,
    expected_error: str | None,
) -> None:
    identity = _identity(age_group="child")
    gateway = _Gateway(tmp_path)
    gateway.identity_result = result
    operation = CharacterGenerationUseCases(gateway).generate_identity_image(
        repository=_repository(identity),
        project_dir=tmp_path,
        character_name="秦",
        identity_id=identity.identity_id,
        options=_options,
        asset_url=_asset_url,
    )

    if expected_error is None:
        assert await operation == {"image_url": "/media/identity.png"}
    else:
        with pytest.raises(CharacterImageGenerationRejected, match=expected_error):
            await operation

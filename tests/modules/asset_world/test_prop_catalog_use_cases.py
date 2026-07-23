from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.dto import (
    CreatePropCommand,
    UpdatePropCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidPropInput,
    PropAlreadyExists,
    PropCatalogRejected,
    PropNotFound,
)
from ai_anime.modules.asset_world.application.prop_catalog import (
    PropCatalogUseCases,
)
from ai_anime.modules.asset_world.infrastructure.prop_catalog import (
    NovelEpisodeLocalPropSource,
)


@dataclass
class _Prop:
    name: str
    aliases: list[str] = field(default_factory=list)
    prop_type: str = "object"
    visual_prompt: str = ""
    description: str = ""
    owner: str = ""
    notes: str = ""
    updated_at: str = ""


@dataclass
class _Episode:
    number: int
    prop_menu: list[dict]
    updated_at: str = ""


class _Repository:
    def __init__(
        self,
        props: list[_Prop] | None = None,
        episodes: list[_Episode] | None = None,
    ) -> None:
        self.props = {prop.name: prop for prop in props or []}
        self.episodes = episodes or []

    async def list_props(self) -> list[_Prop]:
        return list(self.props.values())

    async def get_prop(self, name: str) -> _Prop | None:
        return self.props.get(name)

    async def add_prop(self, prop: _Prop) -> None:
        self.props[prop.name] = prop

    async def update_prop(self, name: str, **updates) -> bool:
        prop = self.props[name]
        for key, value in updates.items():
            setattr(prop, key, value)
        return True

    async def rename_prop(self, old_name: str, new_name: str) -> bool:
        prop = self.props.pop(old_name)
        prop.name = new_name
        self.props[new_name] = prop
        return True

    async def delete_prop(self, name: str) -> bool:
        return self.props.pop(name, None) is not None

    async def list_episodes(self) -> list[_Episode]:
        return self.episodes


class _Factory:
    def create(self, command: CreatePropCommand) -> _Prop:
        return _Prop(
            name=command.name,
            aliases=list(command.aliases),
            prop_type=command.prop_type,
            visual_prompt=command.visual_prompt,
            description=command.description,
            owner=command.owner,
            notes=command.notes,
        )


class _Assets:
    def __init__(self) -> None:
        self.renames: list[tuple[str, str]] = []
        self.rename_error = ""

    def reference_path(self, project_dir: Path, prop_name: str) -> str:
        return str(
            project_dir / "assets" / "props" / prop_name / "reference_3view.png"
        )

    def updated_at(self, project_dir: Path, prop: _Prop) -> str:
        return prop.updated_at or "2026-07-23T00:00:00Z"

    def rename_directory(
        self,
        project_dir: Path,
        old_name: str,
        new_name: str,
    ) -> None:
        if self.rename_error:
            raise ValueError(self.rename_error)
        self.renames.append((old_name, new_name))


def _use_cases(assets: _Assets | None = None) -> PropCatalogUseCases:
    return PropCatalogUseCases(
        _Factory(),
        assets or _Assets(),
        NovelEpisodeLocalPropSource(),
    )


@pytest.mark.asyncio
async def test_list_projects_global_and_unique_episode_local_props(
    tmp_path: Path,
) -> None:
    repository = _Repository(
        [_Prop(name="GlobalSword", visual_prompt="silver sword")],
        [
            _Episode(
                number=2,
                updated_at="2026-05-21 03:12:44",
                prop_menu=[
                    {"prop_id": "GlobalSword"},
                    {
                        "prop_id": "LocalCharm",
                        "prop_type": "artifact",
                        "description": "one-off charm",
                    },
                    {"prop_id": "LocalCharm"},
                ],
            )
        ],
    )

    data = await _use_cases().list_props(
        repository=repository,
        project_dir=tmp_path,
        asset_url=lambda path: f"/media/{Path(path).name}",
        scope="all",
    )

    assert [item["name"] for item in data] == ["GlobalSword", "LocalCharm"]
    assert data[0]["scope"] == "global"
    assert data[0]["reference_url"] == "/media/reference_3view.png"
    assert data[1] == {
        "name": "LocalCharm",
        "aliases": [],
        "prop_type": "artifact",
        "visual_prompt": "one-off charm",
        "description": "one-off charm",
        "owner": "",
        "notes": "",
        "updated_at": "2026-05-21T03:12:44Z",
        "scope": "local",
        "source_episode": 2,
        "reference_path": "",
        "reference_url": "",
    }


@pytest.mark.asyncio
async def test_create_trims_name_and_projects_catalog_fields(tmp_path: Path) -> None:
    repository = _Repository()

    data = await _use_cases().create_prop(
        repository=repository,
        project_dir=tmp_path,
        asset_url=lambda path: f"/media/{Path(path).name}",
        command=CreatePropCommand(
            name="  七星剑  ",
            aliases=("北斗剑",),
            prop_type="weapon",
            visual_prompt="bronze sword",
        ),
    )

    assert data["name"] == "七星剑"
    assert data["aliases"] == ["北斗剑"]
    assert data["prop_type"] == "weapon"
    assert (await repository.get_prop("七星剑")).visual_prompt == "bronze sword"


@pytest.mark.asyncio
async def test_create_rejects_empty_and_duplicate_names(tmp_path: Path) -> None:
    repository = _Repository([_Prop(name="七星剑")])

    with pytest.raises(InvalidPropInput, match="name is required"):
        await _use_cases().create_prop(
            repository=repository,
            project_dir=tmp_path,
            asset_url=str,
            command=CreatePropCommand(name="   "),
        )
    with pytest.raises(PropAlreadyExists, match="already exists"):
        await _use_cases().create_prop(
            repository=repository,
            project_dir=tmp_path,
            asset_url=str,
            command=CreatePropCommand(name="七星剑"),
        )


@pytest.mark.asyncio
async def test_update_renames_asset_and_applies_fields(tmp_path: Path) -> None:
    repository = _Repository([_Prop(name="Sword", visual_prompt="silver")])
    assets = _Assets()

    data = await _use_cases(assets).update_prop(
        repository=repository,
        project_dir=tmp_path,
        asset_url=lambda path: f"/media/{Path(path).name}",
        prop_name="Sword",
        command=UpdatePropCommand(
            fields={"name": "MoonSword", "visual_prompt": "moonlit sword"}
        ),
    )

    assert assets.renames == [("Sword", "MoonSword")]
    assert await repository.get_prop("Sword") is None
    assert data["name"] == "MoonSword"
    assert data["visual_prompt"] == "moonlit sword"


@pytest.mark.asyncio
async def test_update_rejects_duplicate_and_asset_conflict(tmp_path: Path) -> None:
    repository = _Repository([_Prop(name="Sword"), _Prop(name="MoonSword")])

    with pytest.raises(PropAlreadyExists, match="already exists"):
        await _use_cases().update_prop(
            repository=repository,
            project_dir=tmp_path,
            asset_url=str,
            prop_name="Sword",
            command=UpdatePropCommand(fields={"name": "MoonSword"}),
        )

    assets = _Assets()
    assets.rename_error = "target asset exists"
    with pytest.raises(PropCatalogRejected, match="target asset exists"):
        await _use_cases(assets).update_prop(
            repository=_Repository([_Prop(name="Sword")]),
            project_dir=tmp_path,
            asset_url=str,
            prop_name="Sword",
            command=UpdatePropCommand(fields={"name": "SunSword"}),
        )


@pytest.mark.asyncio
async def test_delete_rejects_missing_prop_and_deletes_existing() -> None:
    repository = _Repository([_Prop(name="Sword")])

    with pytest.raises(PropNotFound, match="not found"):
        await _use_cases().delete_prop(
            repository=repository,
            prop_name="Missing",
        )

    data = await _use_cases().delete_prop(
        repository=repository,
        prop_name="Sword",
    )
    assert data == {"deleted": True}
    assert await repository.get_prop("Sword") is None

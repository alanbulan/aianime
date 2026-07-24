from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

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
    LocalPropPromotionRepository,
    NovelEpisodeLocalPropSource,
)
from ai_anime.modules.asset_world.public import promote_episode_props_to_global
from ai_anime.modules.asset_world.public import (
    runtime_prop_menu_for_episode,
    runtime_prop_menu_with_cached_global_props,
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


@pytest.mark.asyncio
async def test_promote_episode_props_skips_aliases_and_syncs_outer_cache() -> None:
    repository = _Repository([_Prop(name="Key", aliases=["Silver Key"])])

    class Wrapper:
        def __init__(self) -> None:
            self.sqlite_store = repository
            self._props: dict[str, Any] = {}

    wrapper = Wrapper()
    promoted = await promote_episode_props_to_global(
        wrapper,
        [
            {"prop_id": " silver\u3000 key "},
            {
                "prop_id": "账单",
                "prop_type": "document",
                "description": "一张逾期账单",
                "owner_identity_id": "陆辰_default",
            },
            {"prop_id": "账单"},
        ],
    )

    assert promoted == ["账单"]
    prop = await repository.get_prop("账单")
    assert prop is not None
    assert prop.prop_type == "document"
    assert prop.visual_prompt == "一张逾期账单"
    assert prop.description == "一张逾期账单"
    assert prop.owner == "陆辰_default"
    assert prop.notes == "auto_from_episode_planning"
    assert wrapper._props == {"账单": prop}


@pytest.mark.asyncio
async def test_promote_episode_props_returns_empty_for_unsupported_store() -> None:
    promoted = await _use_cases().promote_episode_props(
        repository=LocalPropPromotionRepository(object()),
        prop_menu=[{"prop_id": "账单"}],
    )

    assert promoted == []


def test_runtime_prop_menu_adds_cached_global_markers_in_stable_order() -> None:
    class CachedStore:
        def get_cached_prop(self, prop_id: str) -> _Prop | None:
            if prop_id == "账单":
                return _Prop(
                    name="账单",
                    prop_type="document",
                    visual_prompt="一张逾期账单",
                )
            return None

    prop_menu = [{"prop_id": "手机", "description": "本集手机"}]
    beats = [
        {"visual_description": "他拿起[[手机]]、[[账单]]和[[未知道具]]。"},
        {"visual_description": "特写[[账单]]。"},
    ]

    data = runtime_prop_menu_with_cached_global_props(
        prop_menu=prop_menu,
        beats=beats,
        store=CachedStore(),
    )

    assert [item["prop_id"] for item in data] == ["手机", "账单"]
    assert data[0]["description"] == "本集手机"
    assert data[1] == {
        "prop_id": "账单",
        "is_global_asset": True,
        "prop_type": "document",
        "description": "一张逾期账单",
    }


@pytest.mark.asyncio
async def test_runtime_episode_prop_menu_uses_the_same_projection() -> None:
    class MenuItem:
        def model_dump(self) -> dict[str, str]:
            return {"prop_id": "纸箱", "marker_color": "#1b5e20 FOREST GREEN"}

    class CachedStore:
        def get_cached_prop(self, prop_id: str) -> _Prop | None:
            return _Prop(name=prop_id, description="全局纸箱")

    data = await runtime_prop_menu_for_episode(
        CachedStore(),
        _Episode(number=1, prop_menu=[]),
        [{"visual_description": "角落里有[[纸箱]]。"}],
    )
    assert data[0]["description"] == "全局纸箱"

    episode = _Episode(number=1, prop_menu=[])
    episode.prop_menu = [MenuItem()]
    data = await runtime_prop_menu_for_episode(
        CachedStore(),
        episode,
        [{"visual_description": "角落里有[[纸箱]]。"}],
    )

    assert data[0]["marker_color"] == "#1b5e20 FOREST GREEN"
    assert data[0]["description"] == "全局纸箱"

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.dto import (
    CreateSceneCommand,
    UpdateSceneCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidSceneInput,
    SceneAlreadyExists,
    SceneCatalogRejected,
    SceneNotFound,
)
from ai_anime.modules.asset_world.application.scene_catalog import (
    SceneCatalogUseCases,
)
from ai_anime.modules.asset_world.domain.scene_catalog import (
    compose_scene_asset_name,
    scene_identity,
)


@dataclass
class _Scene:
    name: str
    aliases: list[str] = field(default_factory=list)
    scene_type: str = "interior"
    base_scene_id: str = ""
    variant_id: str = ""
    time_of_day: str = ""
    environment_prompt: str = ""
    variant_prompt: str = ""
    description: str = ""
    spatial_layout_image: str = ""
    notes: str = ""


class _Repository:
    def __init__(self, scenes: list[_Scene] | None = None) -> None:
        self.scenes = {scene.name: scene for scene in scenes or []}

    async def list_scenes(self) -> list[_Scene]:
        return list(self.scenes.values())

    async def get_scene(self, name: str) -> _Scene | None:
        return self.scenes.get(name)

    async def add_scene(self, scene: _Scene) -> None:
        self.scenes[scene.name] = scene

    async def update_scene(self, name: str, **updates) -> bool:
        for key, value in updates.items():
            setattr(self.scenes[name], key, value)
        return True

    async def rename_scene(self, old_name: str, new_name: str) -> bool:
        scene = self.scenes.pop(old_name)
        scene.name = new_name
        self.scenes[new_name] = scene
        return True

    async def delete_scene(self, name: str) -> bool:
        return self.scenes.pop(name, None) is not None


class _Factory:
    def create(self, command: CreateSceneCommand) -> _Scene:
        return _Scene(
            name=command.name,
            aliases=list(command.aliases),
            scene_type=command.scene_type,
            base_scene_id=command.base_scene_id,
            variant_id=command.variant_id,
            time_of_day=command.time_of_day,
            environment_prompt=command.environment_prompt,
            variant_prompt=command.variant_prompt,
            description=command.description,
            spatial_layout_image=command.spatial_layout_image,
            notes=command.notes,
        )


class _Assets:
    def __init__(self) -> None:
        self.renames: list[tuple[Path, str, str]] = []
        self.base_scenes: list[_Scene | None] = []

    def project(self, *, project_dir, scene, base_scene, asset_url):
        self.base_scenes.append(base_scene)
        return {
            "effective_environment_prompt": scene.environment_prompt,
            "updated_at": "",
            "master_path": "",
            "master_url": "",
            "reverse_master_path": "",
            "reverse_master_url": "",
            "pano_path": "",
            "pano_url": "",
            "custom_scene_path": "",
            "custom_scene_url": "",
            "stage_3gs": {},
        }

    def rename_directories(self, project_dir, old_name, new_name) -> None:
        self.renames.append((project_dir, old_name, new_name))


def _use_cases(assets: _Assets | None = None) -> SceneCatalogUseCases:
    return SceneCatalogUseCases(_Factory(), assets or _Assets())


@pytest.mark.asyncio
async def test_lists_scenes_with_structured_base_projection(tmp_path: Path) -> None:
    base = _Scene(name="故宫", environment_prompt="朱墙")
    derived = _Scene(
        name="故宫_下雪",
        base_scene_id="故宫",
        variant_id="下雪",
        variant_prompt="积雪",
    )
    assets = _Assets()

    data = await _use_cases(assets).list_scenes(
        repository=_Repository([base, derived]),
        project_dir=tmp_path,
        asset_url=lambda _path: "",
    )

    by_name = {item["name"]: item for item in data}
    assert by_name["故宫_下雪"]["derived_from_scene"] == "故宫"
    assert by_name["故宫_下雪"]["base_scene_id"] == "故宫"
    assert assets.base_scenes == [None, base]


def test_scene_domain_composes_and_recovers_structured_identity() -> None:
    assert compose_scene_asset_name("", "卫生间", "漏水", "夜晚") == "卫生间_漏水_夜晚"
    assert scene_identity(
        _Scene(name="卫生间_漏水_夜晚", base_scene_id="卫生间")
    ) == ("卫生间", "漏水", "夜晚")
    assert scene_identity(_Scene(name="地下_主控室")) == ("", "", "")


@pytest.mark.asyncio
async def test_creates_structured_scene_with_normalized_fields(tmp_path: Path) -> None:
    repository = _Repository([_Scene(name="卫生间")])

    data = await _use_cases().create_scene(
        repository=repository,
        project_dir=tmp_path,
        asset_url=lambda _path: "",
        command=CreateSceneCommand(
            name="",
            base_scene_id=" 卫生间 ",
            variant_id=" 漏水 ",
            time_of_day=" 夜晚 ",
        ),
    )

    assert data["name"] == "卫生间_漏水_夜晚"
    scene = await repository.get_scene("卫生间_漏水_夜晚")
    assert scene is not None
    assert (scene.base_scene_id, scene.variant_id, scene.time_of_day) == (
        "卫生间",
        "漏水",
        "夜晚",
    )


@pytest.mark.asyncio
async def test_updates_scene_and_moves_owned_directories(tmp_path: Path) -> None:
    repository = _Repository([_Scene(name="Hall", environment_prompt="dark")])
    assets = _Assets()

    data = await _use_cases(assets).update_scene(
        repository=repository,
        project_dir=tmp_path,
        asset_url=lambda _path: "",
        scene_name="Hall",
        command=UpdateSceneCommand(
            fields={"name": "GrandHall", "environment_prompt": "bright"}
        ),
    )

    assert data["name"] == "GrandHall"
    assert assets.renames == [(tmp_path, "Hall", "GrandHall")]
    assert (await repository.get_scene("GrandHall")).environment_prompt == "bright"


@pytest.mark.asyncio
async def test_rename_and_delete_reject_scenes_with_derivatives(tmp_path: Path) -> None:
    repository = _Repository(
        [
            _Scene(name="故宫"),
            _Scene(name="故宫_下雪", base_scene_id="故宫", variant_id="下雪"),
        ]
    )
    use_cases = _use_cases()

    with pytest.raises(SceneCatalogRejected, match="存在派生场景"):
        await use_cases.update_scene(
            repository=repository,
            project_dir=tmp_path,
            asset_url=lambda _path: "",
            scene_name="故宫",
            command=UpdateSceneCommand(fields={"name": "紫禁城"}),
        )
    with pytest.raises(SceneCatalogRejected, match="存在派生场景"):
        await use_cases.delete_scene(repository=repository, scene_name="故宫")


@pytest.mark.asyncio
async def test_scene_catalog_reports_expected_input_conflicts(tmp_path: Path) -> None:
    use_cases = _use_cases()
    repository = _Repository([_Scene(name="Hall")])

    with pytest.raises(InvalidSceneInput, match="name is required"):
        await use_cases.create_scene(
            repository=repository,
            project_dir=tmp_path,
            asset_url=lambda _path: "",
            command=CreateSceneCommand(name=""),
        )
    with pytest.raises(SceneAlreadyExists, match="already exists"):
        await use_cases.create_scene(
            repository=repository,
            project_dir=tmp_path,
            asset_url=lambda _path: "",
            command=CreateSceneCommand(name="Hall"),
        )
    with pytest.raises(SceneNotFound, match="not found"):
        await use_cases.delete_scene(repository=repository, scene_name="Missing")

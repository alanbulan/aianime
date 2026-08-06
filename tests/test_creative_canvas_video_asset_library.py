from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.creative_canvas.application.video_asset_library import (
    AddCreativeCanvasVideoAssetCommand,
    CreativeCanvasVideoAssetLibraryUseCases,
    CreativeCanvasVideoAssetMissing,
    CreativeCanvasVideoAssetSourceMissing,
    InvalidCreativeCanvasVideoAssetRequest,
    SyncCreativeCanvasVideoAssetsCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.media_sources import (
    ProjectCreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.infrastructure.video_asset_library import (
    LocalCreativeCanvasVideoAssetRepository,
    ProjectCreativeCanvasMainlineVideoAssetSource,
)
from ai_anime.shared.utils.path_resolver import (
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
)


class _FixedIds:
    def new_id(self) -> str:
        return "asset000001"


class _FixedClock:
    def __init__(self, value: str = "2026-07-27T12:00:00") -> None:
        self.value = value

    def now_isoformat(self) -> str:
        return self.value


class _EmptyMainlineAssets:
    async def list_assets(self, *, context, project_dir):
        return ()


def _use_cases(
    repository,
    *,
    mainline_assets=None,
    clock=None,
) -> CreativeCanvasVideoAssetLibraryUseCases:
    return CreativeCanvasVideoAssetLibraryUseCases(
        repository,
        ProjectCreativeCanvasMediaSourceResolver(),
        mainline_assets or _EmptyMainlineAssets(),
        _FixedIds(),
        clock or _FixedClock(),
    )


def test_video_asset_library_add_list_delete_roundtrip(tmp_path: Path) -> None:
    project_dir = tmp_path / "project"
    image_path = project_dir / "freezone" / "_uploads" / "character.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"image")
    image_url = "/static/alice/demo/freezone/_uploads/character.png"
    repository = LocalCreativeCanvasVideoAssetRepository()
    use_cases = _use_cases(repository)

    item = use_cases.add_item(
        AddCreativeCanvasVideoAssetCommand(
            project_dir=project_dir,
            name="  林昭  ",
            image_urls=(image_url,),
        )
    )

    assert item == {
        "id": "asset000001",
        "name": "林昭",
        "media": "image",
        "source": "upload",
        "image_urls": [image_url],
        "video_url": None,
        "audio_url": None,
        "cover_url": image_url,
        "created_at": "2026-07-27T12:00:00",
        "updated_at": "2026-07-27T12:00:00",
    }
    assert use_cases.list_items(project_dir) == (item,)

    use_cases.delete_item(project_dir, "asset000001")
    assert use_cases.list_items(project_dir) == ()
    with pytest.raises(
        CreativeCanvasVideoAssetMissing,
        match="video character library item not found: missing",
    ):
        use_cases.delete_item(project_dir, "missing")


@pytest.mark.parametrize(
    ("command", "message"),
    [
        (
            AddCreativeCanvasVideoAssetCommand(
                project_dir=Path("project"),
                name=" ",
                image_urls=("image.png",),
            ),
            "name is required",
        ),
        (
            AddCreativeCanvasVideoAssetCommand(
                project_dir=Path("project"),
                name="视频",
                media="video",
            ),
            "video_url is required when media=video",
        ),
        (
            AddCreativeCanvasVideoAssetCommand(
                project_dir=Path("project"),
                name="音频",
                media="audio",
            ),
            "audio_url is required when media=audio",
        ),
        (
            AddCreativeCanvasVideoAssetCommand(
                project_dir=Path("project"),
                name="图片",
            ),
            r"image_urls is required \(non-empty\)",
        ),
    ],
)
def test_video_asset_library_rejects_incomplete_input(
    command: AddCreativeCanvasVideoAssetCommand,
    message: str,
) -> None:
    with pytest.raises(InvalidCreativeCanvasVideoAssetRequest, match=message):
        _use_cases(LocalCreativeCanvasVideoAssetRepository()).add_item(command)


def test_video_asset_library_rejects_missing_and_outside_media(tmp_path: Path) -> None:
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    use_cases = _use_cases(LocalCreativeCanvasVideoAssetRepository())

    with pytest.raises(CreativeCanvasVideoAssetSourceMissing) as missing:
        use_cases.add_item(
            AddCreativeCanvasVideoAssetCommand(
                project_dir=project_dir,
                name="缺失图片",
                image_urls=("missing.png",),
            )
        )
    assert str(missing.value) == f"image not found: {project_dir / 'missing.png'}"

    with pytest.raises(
        InvalidCreativeCanvasVideoAssetRequest,
        match="url resolves outside project",
    ):
        use_cases.add_item(
            AddCreativeCanvasVideoAssetCommand(
                project_dir=project_dir,
                name="越界图片",
                image_urls=("../outside.png",),
            )
        )


class _CountingRepository:
    def __init__(self, items):
        self.items = [dict(item) for item in items]
        self.list_count = 0
        self.save_count = 0

    def list_items(self, project_dir):
        self.list_count += 1
        return tuple(dict(item) for item in self.items)

    def save_items(self, project_dir, items):
        self.save_count += 1
        self.items = [dict(item) for item in items]


class _MainlineAssets:
    async def list_assets(self, *, context, project_dir):
        return (
            {
                "id": "mainline:character:林昭",
                "name": "林昭",
                "media": "image",
                "source": "character",
                "url": "/static/alice/demo/assets/characters/林昭/portrait.png",
            },
            {
                "id": "mainline:scene:雨巷",
                "name": "雨巷",
                "media": "image",
                "source": "scene",
                "url": "/static/alice/demo/assets/scenes/雨巷/master.png",
            },
        )


@pytest.mark.asyncio
async def test_video_asset_library_sync_is_idempotent_and_saves_once() -> None:
    repository = _CountingRepository(
        [
            {
                "id": "mainline:character:林昭",
                "name": "旧名称",
                "media": "image",
                "source": "character",
                "image_urls": ["old.png"],
                "created_at": "2026-01-01T00:00:00",
                "updated_at": "2026-01-01T00:00:00",
            }
        ]
    )
    use_cases = _use_cases(
        repository,
        mainline_assets=_MainlineAssets(),
        clock=_FixedClock("2026-07-27T13:00:00"),
    )
    command = SyncCreativeCanvasVideoAssetsCommand(
        context=SimpleNamespace(),
        project_dir=Path("project"),
    )

    first = await use_cases.sync_from_mainline(command)
    second = await use_cases.sync_from_mainline(command)

    assert first.synced == 2
    assert second.synced == 2
    assert repository.list_count == 2
    assert repository.save_count == 2
    assert len(repository.items) == 2
    character = next(
        item
        for item in repository.items
        if item["id"] == "mainline:character:林昭"
    )
    assert character["name"] == "林昭"
    assert character["created_at"] == "2026-01-01T00:00:00"
    assert character["updated_at"] == "2026-07-27T13:00:00"


@pytest.mark.asyncio
async def test_mainline_asset_source_collects_only_project_owned_existing_files(
    tmp_path: Path,
) -> None:
    project_dir = tmp_path / "project"
    portrait = canonical_portrait_path(project_dir, "林昭")
    scene = canonical_scene_master_path(project_dir, "雨巷")
    prop = canonical_prop_reference_path(project_dir, "旧伞")
    voice = project_dir / "assets" / "voices" / "lin.mp3"
    for path in (portrait, scene, prop, voice):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"asset")
    outside_voice = tmp_path / "outside.mp3"
    outside_voice.write_bytes(b"outside")

    character = SimpleNamespace(
        name="林昭",
        reference_audio_path="assets/voices/lin.mp3",
        reference_audio_sha256="",
        voice_samples_by_age_group={},
    )
    external_character = SimpleNamespace(
        name="外部角色",
        reference_audio_path=str(outside_voice),
        reference_audio_sha256="",
        voice_samples_by_age_group={},
    )

    class Store:
        def get_all_characters(self):
            return [character, external_character]

        async def list_scenes(self):
            return [SimpleNamespace(name="雨巷")]

        async def list_props(self):
            return [SimpleNamespace(name="旧伞")]

    async def store_factory(context):
        return Store()

    def static_url_builder(context, relative_path, local_path=None):
        return f"/static/project/{relative_path}"

    source = ProjectCreativeCanvasMainlineVideoAssetSource(
        store_factory=store_factory,
        static_url_builder=static_url_builder,
    )
    assets = await source.list_assets(
        context=SimpleNamespace(),
        project_dir=project_dir,
    )

    assert {asset["id"] for asset in assets} == {
        "mainline:character:林昭",
        "mainline:voice:林昭",
        "mainline:scene:雨巷",
        "mainline:prop:旧伞",
    }


def test_video_asset_repository_treats_invalid_json_as_empty(tmp_path: Path) -> None:
    repository = LocalCreativeCanvasVideoAssetRepository()
    path = repository.path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text("{invalid", encoding="utf-8")

    assert repository.list_items(tmp_path) == ()

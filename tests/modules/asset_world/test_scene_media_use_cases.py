from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

import pytest
from PIL import Image

from ai_anime.modules.asset_world.application.errors import (
    InvalidSceneMediaInput,
    SceneNotFound,
)
from ai_anime.modules.asset_world.application.scene_media import SceneMediaUseCases
from ai_anime.modules.asset_world.infrastructure.scene_media import LocalSceneMediaFiles


@dataclass
class _Scene:
    name: str


class _Repository:
    def __init__(self, scenes: list[_Scene] | None = None) -> None:
        self.scenes = {scene.name: scene for scene in scenes or []}

    async def get_scene(self, name: str) -> _Scene | None:
        return self.scenes.get(name)


class _Upload:
    def __init__(self, content: bytes, filename: str = "asset.png") -> None:
        self.filename = filename
        self.file = io.BytesIO(content)
        self.read_calls = 0

    async def read(self) -> bytes:
        self.read_calls += 1
        return self.file.read()


class _FailingUpload(_Upload):
    async def read(self) -> bytes:
        raise OSError("read failed")


class _Files:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.deleted = {
            "master": True,
            "pano": False,
            "custom": True,
        }

    def save_master(self, project_dir, scene_name, content):
        self.calls.append(("save_master", project_dir, scene_name, content))
        return project_dir / "master.png"

    def delete_master(self, project_dir, scene_name):
        self.calls.append(("delete_master", project_dir, scene_name))
        return self.deleted["master"]

    def save_pano(self, project_dir, scene_name, content):
        self.calls.append(("save_pano", project_dir, scene_name, content))
        return project_dir / "pano_360.png"

    def delete_pano(self, project_dir, scene_name):
        self.calls.append(("delete_pano", project_dir, scene_name))
        return self.deleted["pano"]

    def save_custom_package(self, project_dir, scene_name, suffix, stream):
        self.calls.append(
            ("save_custom_package", project_dir, scene_name, suffix, stream.read())
        )
        return {"ok": True}

    def delete_custom_package(self, project_dir, scene_name):
        self.calls.append(("delete_custom_package", project_dir, scene_name))
        return self.deleted["custom"]


def _repository() -> _Repository:
    return _Repository([_Scene(name="大殿")])


@pytest.mark.asyncio
async def test_uploads_master_and_pano_through_media_files(tmp_path: Path) -> None:
    files = _Files()
    use_cases = SceneMediaUseCases(files)
    master = _Upload(b"master")
    pano = _Upload(b"pano")

    master_scene = await use_cases.upload_master(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
        upload=master,
    )
    pano_scene = await use_cases.upload_pano(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
        upload=pano,
    )

    assert master_scene.name == "大殿"
    assert pano_scene.name == "大殿"
    assert master.read_calls == 1
    assert pano.read_calls == 1
    assert files.calls == [
        ("save_master", tmp_path, "大殿", b"master"),
        ("save_pano", tmp_path, "大殿", b"pano"),
    ]


@pytest.mark.asyncio
async def test_deletes_scene_media_through_media_files(tmp_path: Path) -> None:
    files = _Files()
    use_cases = SceneMediaUseCases(files)

    master = await use_cases.delete_master(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
    )
    pano = await use_cases.delete_pano(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
    )
    custom = await use_cases.delete_custom_package(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
    )

    assert master == {"deleted": True}
    assert pano == {"deleted": False}
    assert custom == {"deleted": True}
    assert files.calls == [
        ("delete_master", tmp_path, "大殿"),
        ("delete_pano", tmp_path, "大殿"),
        ("delete_custom_package", tmp_path, "大殿"),
    ]


@pytest.mark.asyncio
async def test_custom_package_uses_stream_without_full_upload_read(
    tmp_path: Path,
) -> None:
    files = _Files()
    use_cases = SceneMediaUseCases(files)
    upload = _FailingUpload(b"sog package", filename="SCENE.SOG")

    scene = await use_cases.upload_custom_package(
        repository=_repository(),
        project_dir=tmp_path,
        scene_name="大殿",
        upload=upload,
    )

    assert scene.name == "大殿"
    assert files.calls == [
        ("save_custom_package", tmp_path, "大殿", ".sog", b"sog package")
    ]


@pytest.mark.asyncio
async def test_custom_package_rejects_unsupported_suffix(tmp_path: Path) -> None:
    files = _Files()
    use_cases = SceneMediaUseCases(files)

    with pytest.raises(
        InvalidSceneMediaInput,
        match="Custom scene package must be .ply, .sog, .splat, or .ksplat",
    ):
        await use_cases.upload_custom_package(
            repository=_repository(),
            project_dir=tmp_path,
            scene_name="大殿",
            upload=_Upload(b"data", filename="scene.zip"),
        )

    assert files.calls == []


@pytest.mark.asyncio
async def test_image_upload_maps_read_failure(tmp_path: Path) -> None:
    use_cases = SceneMediaUseCases(_Files())

    with pytest.raises(InvalidSceneMediaInput, match="Invalid image file: read failed"):
        await use_cases.upload_master(
            repository=_repository(),
            project_dir=tmp_path,
            scene_name="大殿",
            upload=_FailingUpload(b""),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "operation",
    [
        "upload_master",
        "delete_master",
        "upload_pano",
        "delete_pano",
        "upload_custom_package",
        "delete_custom_package",
    ],
)
async def test_scene_media_requires_existing_scene(
    operation: str,
    tmp_path: Path,
) -> None:
    use_cases = SceneMediaUseCases(_Files())
    kwargs = {
        "repository": _Repository(),
        "project_dir": tmp_path,
        "scene_name": "不存在",
    }
    if operation.startswith("upload_"):
        kwargs["upload"] = _Upload(b"data", filename="scene.sog")

    with pytest.raises(SceneNotFound, match="Scene '不存在' not found"):
        await getattr(use_cases, operation)(**kwargs)


def _png_bytes(size: tuple[int, int]) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color=(10, 20, 30)).save(output, format="PNG")
    return output.getvalue()


def test_local_scene_media_validates_images_and_pano_ratio(tmp_path: Path) -> None:
    files = LocalSceneMediaFiles()

    with pytest.raises(InvalidSceneMediaInput, match="Invalid image file:"):
        files.save_master(tmp_path, "大殿", b"not an image")
    with pytest.raises(
        InvalidSceneMediaInput,
        match="360 panorama must be close to 2:1 equirectangular; got 4x3",
    ):
        files.save_pano(tmp_path, "大殿", _png_bytes((4, 3)))


def test_local_scene_media_rejects_empty_custom_package(tmp_path: Path) -> None:
    files = LocalSceneMediaFiles()

    with pytest.raises(InvalidSceneMediaInput, match="Custom scene package is empty"):
        files.save_custom_package(
            tmp_path,
            "大殿",
            ".sog",
            io.BytesIO(),
        )

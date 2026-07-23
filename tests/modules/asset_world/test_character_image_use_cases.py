from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from PIL import Image

from ai_anime.modules.asset_world.application.character_images import (
    CharacterImageUseCases,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterIdentityNotFound,
    CharacterNotFound,
)
from ai_anime.modules.asset_world.infrastructure.character_image_storage import (
    LocalCharacterImageFiles,
)
from ai_anime.utils.path_resolver import (
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
)


@dataclass
class _Identity:
    identity_id: str
    identity_name: str
    costume_image: str = ""
    portrait_image: str = ""


@dataclass
class _Character:
    name: str
    identities: list[_Identity] = field(default_factory=list)


class _Repository:
    def __init__(self, characters: list[_Character] | None = None) -> None:
        self.characters = {
            character.name: character for character in characters or []
        }
        self.identity_updates: list[tuple[str, str, dict]] = []

    def get_character(self, name: str) -> _Character | None:
        return self.characters.get(name)

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates,
    ) -> None:
        self.identity_updates.append((character_name, identity_id, updates))
        character = self.characters[character_name]
        identity = next(
            item for item in character.identities if item.identity_id == identity_id
        )
        for field_name, value in updates.items():
            setattr(identity, field_name, value)


class _Upload:
    def __init__(self, content: bytes) -> None:
        self._content = content

    async def read(self) -> bytes:
        return self._content


def _png_bytes(color: tuple[int, ...], *, mode: str = "RGBA") -> bytes:
    payload = io.BytesIO()
    Image.new(mode, (4, 4), color=color).save(payload, format="PNG")
    return payload.getvalue()


def _use_cases() -> CharacterImageUseCases:
    return CharacterImageUseCases(LocalCharacterImageFiles())


def _asset_url(path: str | Path) -> str:
    return f"/media/{Path(path).name}"


@pytest.mark.asyncio
async def test_upload_character_portrait_converts_to_rgb_and_backs_up_by_second(
    tmp_path: Path,
) -> None:
    repository = _Repository([_Character(name="秦")])
    target = canonical_portrait_path(tmp_path, "秦")
    target.parent.mkdir(parents=True)
    old_content = _png_bytes((10, 20, 30), mode="RGB")
    target.write_bytes(old_content)

    data = await _use_cases().upload_character_portrait(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        upload=_Upload(_png_bytes((120, 80, 40, 128))),
        asset_url=_asset_url,
    )

    assert data == {"portrait_url": "/media/portrait.png"}
    backups = list(target.parent.glob("portrait_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"portrait_\d{14}\.png", backups[0].name)
    assert backups[0].read_bytes() == old_content
    with Image.open(target) as image:
        assert image.mode == "RGB"


@pytest.mark.asyncio
async def test_upload_identity_image_does_not_require_registered_identity_and_backs_up(
    tmp_path: Path,
) -> None:
    repository = _Repository([_Character(name="秦")])
    target = canonical_identity_path(tmp_path, "秦", "少年")
    target.parent.mkdir(parents=True)
    old_content = _png_bytes((10, 20, 30), mode="RGB")
    target.write_bytes(old_content)

    data = await _use_cases().upload_identity_image(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_name="少年",
        upload=_Upload(_png_bytes((120, 80, 40, 128))),
        asset_url=_asset_url,
    )

    assert data == {"image_url": "/media/少年.png"}
    backups = list(target.parent.glob("少年_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"少年_\d{20}\.png", backups[0].name)
    assert backups[0].read_bytes() == old_content
    with Image.open(target) as image:
        assert image.mode == "RGB"


@pytest.mark.asyncio
async def test_delete_identity_image_is_idempotent(tmp_path: Path) -> None:
    identity = _Identity(identity_id="秦_少年", identity_name="少年")
    repository = _Repository([_Character(name="秦", identities=[identity])])
    target = canonical_identity_path(tmp_path, "秦", "少年")
    target.parent.mkdir(parents=True)
    target.write_bytes(b"image")

    deleted = await _use_cases().delete_identity_image(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
    )
    missing = await _use_cases().delete_identity_image(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
    )

    assert deleted == {"deleted": True}
    assert missing == {"deleted": False}


@pytest.mark.asyncio
async def test_delete_identity_image_preserves_chinese_repository_errors(
    tmp_path: Path,
) -> None:
    use_cases = _use_cases()

    with pytest.raises(ValueError, match="角色 不存在 不存在"):
        await use_cases.delete_identity_image(
            repository=_Repository(),
            project_dir=tmp_path,
            character_name="不存在",
            identity_id="不存在_少年",
        )
    with pytest.raises(ValueError, match="身份 秦_不存在 不存在"):
        await use_cases.delete_identity_image(
            repository=_Repository([_Character(name="秦")]),
            project_dir=tmp_path,
            character_name="秦",
            identity_id="秦_不存在",
        )


@pytest.mark.asyncio
async def test_upload_identity_costume_backs_up_and_syncs_repository(
    tmp_path: Path,
) -> None:
    identity = _Identity(identity_id="秦_少年", identity_name="少年/战损")
    repository = _Repository([_Character(name="秦", identities=[identity])])
    target = canonical_identity_costume_path(tmp_path, "秦", "少年/战损")
    target.parent.mkdir(parents=True)
    old_content = _png_bytes((10, 20, 30), mode="RGB")
    target.write_bytes(old_content)

    data = await _use_cases().upload_identity_costume(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
        upload=_Upload(_png_bytes((120, 80, 40, 128))),
        asset_url=_asset_url,
    )

    assert data == {"costume_image_url": "/media/少年_战损_costume.png"}
    backups = list(target.parent.glob("少年_战损_costume_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(r"少年_战损_costume_\d{14}\.png", backups[0].name)
    assert backups[0].read_bytes() == old_content
    assert repository.identity_updates == [
        ("秦", "秦_少年", {"costume_image": str(target)})
    ]


@pytest.mark.asyncio
async def test_delete_identity_costume_removes_canonical_and_saved_paths_once(
    tmp_path: Path,
) -> None:
    canonical = canonical_identity_costume_path(tmp_path, "秦", "少年")
    saved = tmp_path / "legacy" / "costume.png"
    canonical.parent.mkdir(parents=True)
    saved.parent.mkdir(parents=True)
    canonical.write_bytes(b"canonical")
    saved.write_bytes(b"saved")
    identity = _Identity(
        identity_id="秦_少年",
        identity_name="少年",
        costume_image=str(saved),
    )
    repository = _Repository([_Character(name="秦", identities=[identity])])

    deleted = await _use_cases().delete_identity_costume(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
    )
    missing = await _use_cases().delete_identity_costume(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
    )

    assert deleted == {"deleted": True}
    assert missing == {"deleted": False}
    assert not canonical.exists()
    assert not saved.exists()
    assert identity.costume_image == ""
    assert repository.identity_updates == [
        ("秦", "秦_少年", {"costume_image": ""}),
        ("秦", "秦_少年", {"costume_image": ""}),
    ]


@pytest.mark.asyncio
async def test_upload_identity_portrait_backs_up_and_syncs_repository(
    tmp_path: Path,
) -> None:
    identity = _Identity(identity_id="秦_少年", identity_name="少年/战损")
    repository = _Repository([_Character(name="秦", identities=[identity])])
    target = canonical_identity_portrait_path(tmp_path, "秦", "少年/战损")
    target.parent.mkdir(parents=True)
    old_content = _png_bytes((10, 20, 30), mode="RGB")
    target.write_bytes(old_content)

    data = await _use_cases().upload_identity_portrait(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
        upload=_Upload(_png_bytes((120, 80, 40, 128))),
        asset_url=_asset_url,
    )

    assert data == {"portrait_image_url": "/media/秦_少年_战损_portrait.png"}
    backups = list(target.parent.glob("秦_少年_战损_portrait_*.png"))
    assert len(backups) == 1
    assert re.fullmatch(
        r"秦_少年_战损_portrait_\d{14}\.png",
        backups[0].name,
    )
    assert backups[0].read_bytes() == old_content
    assert repository.identity_updates == [
        ("秦", "秦_少年", {"portrait_image": str(target)})
    ]


def test_identity_attempts_counts_images_and_portraits_but_not_costumes(
    tmp_path: Path,
) -> None:
    identity = _Identity(identity_id="秦_少年", identity_name="少年/战损")
    repository = _Repository([_Character(name="秦", identities=[identity])])
    identities_dir = tmp_path / "assets" / "characters" / "秦" / "identities"
    identities_dir.mkdir(parents=True)
    for filename in (
        "少年_战损.png",
        "少年_战损_20260603112233.png",
        "少年_战损_costume.png",
        "秦_少年_战损_portrait.png",
        "秦_少年_战损_portrait_20260603112233.png",
        "其他.png",
    ):
        (identities_dir / filename).write_bytes(b"image")

    data = _use_cases().identity_attempts(
        repository=repository,
        project_dir=tmp_path,
        character_name="秦",
        identity_id="秦_少年",
    )

    assert data == {"image_attempts": 2, "portrait_attempts": 2}


@pytest.mark.asyncio
async def test_uploads_reject_missing_character_and_identity_in_english(
    tmp_path: Path,
) -> None:
    use_cases = _use_cases()
    upload = _Upload(_png_bytes((120, 80, 40, 128)))

    with pytest.raises(CharacterNotFound, match="Character '不存在' not found"):
        await use_cases.upload_character_portrait(
            repository=_Repository(),
            project_dir=tmp_path,
            character_name="不存在",
            upload=upload,
            asset_url=_asset_url,
        )
    with pytest.raises(CharacterIdentityNotFound, match="Identity '秦_不存在' not found"):
        await use_cases.upload_identity_costume(
            repository=_Repository([_Character(name="秦")]),
            project_dir=tmp_path,
            character_name="秦",
            identity_id="秦_不存在",
            upload=upload,
            asset_url=_asset_url,
        )

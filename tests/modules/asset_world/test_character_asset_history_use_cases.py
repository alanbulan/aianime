from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_anime.modules.asset_world.application.character_asset_history import (
    CharacterAssetHistoryUseCases,
)
from ai_anime.modules.asset_world.application.dto import (
    RestoreCharacterAssetCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    CharacterAssetHistoryNotFound,
    CharacterAssetHistoryRejected,
)
from ai_anime.modules.asset_world.infrastructure.character_asset_history import (
    LocalCharacterAssetHistoryFiles,
)
from ai_anime.utils.path_resolver import (
    canonical_identity_costume_path,
    canonical_identity_path,
)


@dataclass
class _Identity:
    identity_id: str
    identity_name: str


@dataclass
class _Character:
    name: str
    identities: list[_Identity] = field(default_factory=list)


class _Repository:
    def __init__(self, character: _Character) -> None:
        self.character = character
        self.identity_updates: list[tuple[str, str, dict]] = []

    def get_character(self, name: str) -> _Character | None:
        return self.character if name == self.character.name else None

    async def update_character_identity(
        self,
        character_name: str,
        identity_id: str,
        **updates,
    ) -> None:
        self.identity_updates.append((character_name, identity_id, updates))


def _use_cases() -> CharacterAssetHistoryUseCases:
    return CharacterAssetHistoryUseCases(LocalCharacterAssetHistoryFiles())


def _repository() -> _Repository:
    return _Repository(
        _Character(
            name="秦",
            identities=[_Identity(identity_id="秦_少年", identity_name="少年")],
        )
    )


def test_list_history_projects_timestamped_and_history_directory_entries(
    tmp_path: Path,
) -> None:
    repository = _repository()
    target = canonical_identity_path(tmp_path, "秦", "少年")
    target.parent.mkdir(parents=True)
    target.write_bytes(b"current")
    timestamped = target.parent / "少年_20260603112233.png"
    timestamped.write_bytes(b"timestamped")
    history_dir = target.parent / "_history"
    history_dir.mkdir()
    archived = history_dir / "少年.png.run-1.bak"
    archived.write_bytes(b"archived")

    data = _use_cases().list_history(
        repository=repository,
        character_name="秦",
        project_dir=tmp_path,
        kind="identity",
        identity_id="秦_少年",
        asset_url=lambda path: f"/media/{Path(path).name}",
    )

    assert data["current_url"] == "/media/少年.png"
    assert {entry["history_id"] for entry in data["entries"]} == {
        timestamped.name,
        "_history/少年.png.run-1.bak",
    }
    assert {entry["url"] for entry in data["entries"]} == {
        "/media/少年_20260603112233.png",
        "/media/少年.png.run-1.bak",
    }


def test_list_history_rejects_unknown_kind_and_missing_identity(tmp_path: Path) -> None:
    repository = _repository()

    with pytest.raises(CharacterAssetHistoryRejected, match="Unsupported"):
        _use_cases().list_history(
            repository=repository,
            character_name="秦",
            project_dir=tmp_path,
            kind="unknown",
            identity_id="",
            asset_url=lambda path: str(path),
        )
    with pytest.raises(CharacterAssetHistoryRejected, match="not found"):
        _use_cases().list_history(
            repository=repository,
            character_name="秦",
            project_dir=tmp_path,
            kind="identity",
            identity_id="秦_不存在",
            asset_url=lambda path: str(path),
        )


@pytest.mark.asyncio
async def test_restore_history_backs_up_current_and_syncs_costume_path(
    tmp_path: Path,
) -> None:
    repository = _repository()
    target = canonical_identity_costume_path(tmp_path, "秦", "少年")
    target.parent.mkdir(parents=True)
    target.write_bytes(b"current")
    source = target.parent / "少年_costume_20260603112233.png"
    source.write_bytes(b"historic")

    data = await _use_cases().restore_history(
        repository=repository,
        character_name="秦",
        project_dir=tmp_path,
        command=RestoreCharacterAssetCommand(
            kind="identity_costume",
            identity_id="秦_少年",
            history_id=source.name,
        ),
        asset_url=lambda path: f"/media/{Path(path).name}",
    )

    assert target.read_bytes() == b"historic"
    assert data["restored"] is True
    assert data["url"] == "/media/少年_costume.png"
    assert data["backup_history_id"].startswith("少年_costume_")
    backup = target.parent / data["backup_history_id"]
    assert backup.read_bytes() == b"current"
    assert repository.identity_updates == [
        ("秦", "秦_少年", {"costume_image": str(target)})
    ]


@pytest.mark.asyncio
async def test_restore_history_requires_entry_from_current_listing(
    tmp_path: Path,
) -> None:
    repository = _repository()

    with pytest.raises(CharacterAssetHistoryNotFound, match="not found"):
        await _use_cases().restore_history(
            repository=repository,
            character_name="秦",
            project_dir=tmp_path,
            command=RestoreCharacterAssetCommand(
                kind="identity",
                identity_id="秦_少年",
                history_id="../outside.png",
            ),
            asset_url=lambda path: str(path),
        )


@pytest.mark.asyncio
async def test_restore_history_accepts_history_directory_entry(tmp_path: Path) -> None:
    repository = _repository()
    target = canonical_identity_path(tmp_path, "秦", "少年")
    history_dir = target.parent / "_history"
    history_dir.mkdir(parents=True)
    source = history_dir / "少年.png.run-1.bak"
    source.write_bytes(b"archived")

    data = await _use_cases().restore_history(
        repository=repository,
        character_name="秦",
        project_dir=tmp_path,
        command=RestoreCharacterAssetCommand(
            kind="identity",
            identity_id="秦_少年",
            history_id="_history/少年.png.run-1.bak",
        ),
        asset_url=lambda path: f"/media/{Path(path).name}",
    )

    assert target.read_bytes() == b"archived"
    assert data["backup_history_id"] == ""

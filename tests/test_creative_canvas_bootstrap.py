from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_anime.modules.creative_canvas.infrastructure import canvas_store
from ai_anime.modules.creative_canvas.infrastructure.canvas_lock import CanvasLockBusy
from ai_anime.modules.creative_canvas.infrastructure.paths import (
    canvas_path,
    freezone_root,
    uploads_dir,
)
from ai_anime.modules.creative_canvas.application.bootstrap import (
    CreativeCanvasBootstrapBusy,
    CreativeCanvasBootstrapCorrupt,
    CreativeCanvasBootstrapResult,
    CreativeCanvasBootstrapUseCases,
    InitializeCreativeCanvasCommand,
)
from ai_anime.modules.creative_canvas.domain import canvas_actor_id
from ai_anime.modules.creative_canvas.infrastructure.bootstrap import (
    LocalCreativeCanvasBootstrapStorage,
)


def _command(tmp_path: Path) -> InitializeCreativeCanvasCommand:
    return InitializeCreativeCanvasCommand(
        project_dir=tmp_path / "output",
        canvas_state_dir=tmp_path / "state",
        project_id="project-1",
        actor_id="user-1",
    )


@pytest.mark.parametrize(
    ("user", "expected"),
    [
        ({"id": "id-1", "user_id": "user-1", "username": "alice"}, "id-1"),
        ({"user_id": "user-1", "username": "alice"}, "user-1"),
        ({"username": "alice"}, "alice"),
        ({}, ""),
    ],
)
def test_canvas_actor_id_uses_stable_principal_precedence(
    user: dict[str, object],
    expected: str,
) -> None:
    assert canvas_actor_id(user) == expected


def test_bootstrap_use_case_delegates_to_storage(tmp_path: Path) -> None:
    command = _command(tmp_path)
    expected = CreativeCanvasBootstrapResult(
        freezone_dir=tmp_path / "freezone",
        default_canvas_id="default",
        default_canvas_created=True,
        default_canvas_revision=1,
    )

    class FakeStorage:
        def initialize(
            self,
            received: InitializeCreativeCanvasCommand,
        ) -> CreativeCanvasBootstrapResult:
            assert received is command
            return expected

    result = CreativeCanvasBootstrapUseCases(FakeStorage()).initialize(command)

    assert result is expected


def test_local_bootstrap_storage_is_idempotent(tmp_path: Path) -> None:
    command = _command(tmp_path)
    storage = LocalCreativeCanvasBootstrapStorage()

    first = storage.initialize(command)
    second = storage.initialize(command)

    saved = json.loads(
        canvas_path(command.canvas_state_dir, "default").read_text(encoding="utf-8")
    )
    assert first.freezone_dir == freezone_root(command.project_dir)
    assert first.default_canvas_created is True
    assert second.default_canvas_created is False
    assert uploads_dir(command.project_dir).is_dir()
    assert saved["project_id"] == "project-1"
    assert saved["owner_principal_id"] == "user-1"
    assert saved["revision"] == 1


def test_local_bootstrap_storage_maps_corrupt_default_canvas(tmp_path: Path) -> None:
    command = _command(tmp_path)
    target = canvas_path(command.canvas_state_dir, "default")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("{invalid", encoding="utf-8")

    with pytest.raises(CreativeCanvasBootstrapCorrupt, match="corrupt canvas json"):
        LocalCreativeCanvasBootstrapStorage().initialize(command)


def test_local_bootstrap_storage_maps_busy_canvas_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_busy(*_args, **_kwargs):
        raise CanvasLockBusy("default")

    monkeypatch.setattr(canvas_store, "ensure_default_canvas", raise_busy)

    with pytest.raises(CreativeCanvasBootstrapBusy) as exc:
        LocalCreativeCanvasBootstrapStorage().initialize(_command(tmp_path))

    assert exc.value.canvas_id == "default"

from __future__ import annotations

import json
from pathlib import Path

from ai_anime.modules.production.application.video_pool import (
    AddGeneratedVideoCommand,
)
from ai_anime.modules.production.infrastructure.video_pool import (
    LocalVideoPoolStorage,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_video_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id="user_editor",
        requester_username="bob",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


def _configure_roots(monkeypatch, tmp_path: Path) -> tuple[Path, Path]:
    from ai_anime.shared.utils import state_index_files

    output_root = tmp_path / "output"
    state_root = tmp_path / "state"
    monkeypatch.setattr(state_index_files, "OUTPUT_DIR", str(output_root))
    monkeypatch.setattr(state_index_files, "STATE_DIR", str(state_root))
    return output_root, state_root


def test_add_keeps_media_in_output_and_index_in_state(monkeypatch, tmp_path) -> None:
    _output_root, state_root = _configure_roots(monkeypatch, tmp_path)
    context = _context(tmp_path)
    source_video = tmp_path / "source.mp4"
    source_video.write_bytes(b"video")

    storage = LocalVideoPoolStorage()
    entry = storage.add(
        context,
        AddGeneratedVideoCommand(
            episode_num=1,
            beat_num=2,
            source_video_path=source_video,
        ),
    )

    episode_dir = Path(context.output_dir) / "videos" / "beats" / "ep001"
    assert (episode_dir / "pool" / entry.video_path).read_bytes() == b"video"
    assert not (episode_dir / "video_pool_index.json").exists()
    state_index = (
        state_root
        / "alice"
        / "demo"
        / "videos"
        / "beats"
        / "ep001"
        / "video_pool_index.json"
    )
    payload = json.loads(state_index.read_text(encoding="utf-8"))
    assert payload["beat_assignments"] == {"2": entry.id}
    assert storage.load(context, 1).entry(entry.id) == entry


def test_load_ignores_output_sidecar(monkeypatch, tmp_path) -> None:
    _output_root, state_root = _configure_roots(monkeypatch, tmp_path)
    context = _context(tmp_path)
    episode_dir = Path(context.output_dir) / "videos" / "beats" / "ep001"
    episode_dir.mkdir(parents=True)
    legacy_path = episode_dir / "video_pool_index.json"
    legacy_path.write_text(
        json.dumps(
            {
                "episode": 1,
                "generated_at": "2026-01-01T00:00:00",
                "videos": [],
                "beat_assignments": {"1": "beat_01_20260101_000000"},
            }
        ),
        encoding="utf-8",
    )

    pool = LocalVideoPoolStorage().load(context, 1)

    state_path = (
        state_root
        / "alice"
        / "demo"
        / "videos"
        / "beats"
        / "ep001"
        / "video_pool_index.json"
    )
    assert pool is None
    assert not state_path.exists()
    assert legacy_path.exists()


def test_assign_copies_pool_version_and_updates_assignment(monkeypatch, tmp_path) -> None:
    _configure_roots(monkeypatch, tmp_path)
    context = _context(tmp_path)
    source_video = tmp_path / "source.mp4"
    source_video.write_bytes(b"selected-video")
    storage = LocalVideoPoolStorage()
    entry = storage.add(
        context,
        AddGeneratedVideoCommand(
            episode_num=1,
            beat_num=2,
            source_video_path=source_video,
        ),
    )

    assigned = storage.assign(context, 1, 7, entry.id)

    canonical = Path(context.output_dir) / "videos" / "beats" / "ep001" / "beat_07.mp4"
    assert assigned is True
    assert canonical.read_bytes() == b"selected-video"
    assert storage.load(context, 1).beat_assignments["7"] == entry.id


def test_delete_removes_inactive_file_but_protects_active_version(
    monkeypatch,
    tmp_path,
) -> None:
    _configure_roots(monkeypatch, tmp_path)
    context = _context(tmp_path)
    storage = LocalVideoPoolStorage()
    first_source = tmp_path / "first.mp4"
    first_source.write_bytes(b"first")
    first = storage.add(
        context,
        AddGeneratedVideoCommand(
            episode_num=1,
            beat_num=2,
            source_video_path=first_source,
        ),
    )
    second_source = tmp_path / "second.mp4"
    second_source.write_bytes(b"second")
    second = storage.add(
        context,
        AddGeneratedVideoCommand(
            episode_num=1,
            beat_num=2,
            source_video_path=second_source,
        ),
    )
    pool_dir = Path(context.output_dir) / "videos" / "beats" / "ep001" / "pool"

    assert storage.delete(context, 1, second.id) == "assigned"
    assert storage.delete(context, 1, first.id) == "deleted"
    assert not (pool_dir / first.video_path).exists()
    assert (pool_dir / second.video_path).exists()
    remaining = storage.load(context, 1)
    assert remaining is not None
    assert [entry.id for entry in remaining.videos] == [second.id]

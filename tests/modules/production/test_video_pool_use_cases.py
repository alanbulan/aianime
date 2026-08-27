from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from ai_anime.modules.production.application.video_pool import (
    AddGeneratedVideoCommand,
    VideoPoolEntryInUse,
    VideoPoolEntryUnavailable,
    VideoPoolUseCases,
)
from ai_anime.modules.production.domain.video_pool import VideoPool, VideoPoolEntry
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


def _entry() -> VideoPoolEntry:
    return VideoPoolEntry(
        id="beat_06_20260529_120000",
        beat_num=6,
        video_path="beat_06_20260529_120000.mp4",
        generated_at=datetime(2026, 5, 29, 12, 0, 0),
        duration=6.0,
        video_mode="keyframe",
        video_model="cloud-video-test",
        prompt="test prompt",
    )


class _Storage:
    def __init__(
        self,
        pool: VideoPool | None,
        *,
        assigned: bool = True,
        delete_outcome: str = "deleted",
    ) -> None:
        self.pool = pool
        self.assigned = assigned
        self.delete_outcome = delete_outcome
        self.added: AddGeneratedVideoCommand | None = None

    def load(self, _context: ProjectContext, _episode_num: int) -> VideoPool | None:
        return self.pool

    def assign(
        self,
        _context: ProjectContext,
        _episode_num: int,
        _beat_num: int,
        _pool_id: str,
    ) -> bool:
        return self.assigned

    def add(
        self,
        _context: ProjectContext,
        command: AddGeneratedVideoCommand,
    ) -> VideoPoolEntry:
        self.added = command
        return _entry()

    def delete(
        self,
        _context: ProjectContext,
        _episode_num: int,
        _pool_id: str,
    ) -> str:
        return self.delete_outcome


class _MediaUrls:
    def build(self, context: ProjectContext, relative_path: str) -> str:
        return f"/static/projects/{context.project_id}/{relative_path}"


def test_list_pool_returns_none_when_index_is_missing(tmp_path: Path) -> None:
    use_cases = VideoPoolUseCases(_Storage(None), _MediaUrls())

    assert use_cases.list_pool(_context(tmp_path), 1) is None


def test_list_pool_projects_entries_and_assignments(tmp_path: Path) -> None:
    entry = _entry()
    use_cases = VideoPoolUseCases(
        _Storage(
            VideoPool(
                episode=1,
                videos=[entry],
                beat_assignments={"6": entry.id},
            )
        ),
        _MediaUrls(),
    )

    listing = use_cases.list_pool(_context(tmp_path), 1)

    assert listing is not None
    assert listing.as_dict() == {
        "episode": 1,
        "videos": [
            {
                "id": entry.id,
                "beat_num": 6,
                "video_path": entry.video_path,
                "generated_at": "2026-05-29T12:00:00",
                "duration": 6.0,
                "video_mode": "keyframe",
                "video_model": "cloud-video-test",
                "prompt": "test prompt",
                "video_url": (
                    "/static/projects/proj_video_123/videos/beats/ep001/pool/"
                    "beat_06_20260529_120000.mp4"
                ),
            }
        ],
        "beat_assignments": {"6": entry.id},
    }


def test_select_rejects_missing_or_unavailable_entry(tmp_path: Path) -> None:
    use_cases = VideoPoolUseCases(_Storage(None, assigned=False), _MediaUrls())

    with pytest.raises(
        VideoPoolEntryUnavailable,
        match="Pool entry 'missing' not found or file missing",
    ):
        use_cases.select(_context(tmp_path), 1, 6, "missing")


def test_select_and_add_generated_video(tmp_path: Path) -> None:
    storage = _Storage(None)
    use_cases = VideoPoolUseCases(storage, _MediaUrls())
    context = _context(tmp_path)
    command = AddGeneratedVideoCommand(
        episode_num=1,
        beat_num=6,
        source_video_path=tmp_path / "source.mp4",
        duration=7.0,
        video_model="cloud-video-test",
    )

    selected = use_cases.select(context, 1, 6, "pool-6")
    added = use_cases.add_generated(context, command)

    assert selected.as_dict() == {
        "beat_num": 6,
        "pool_id": "pool-6",
        "video_url": (
            "/static/projects/proj_video_123/videos/beats/ep001/beat_06.mp4"
        ),
    }
    assert added == _entry()
    assert storage.added == command


def test_delete_rejects_active_entry_and_returns_deleted_id(tmp_path: Path) -> None:
    context = _context(tmp_path)
    use_cases = VideoPoolUseCases(
        _Storage(None, delete_outcome="assigned"),
        _MediaUrls(),
    )

    with pytest.raises(VideoPoolEntryInUse, match="请先切换"):
        use_cases.delete(context, 1, "active")

    deleted = VideoPoolUseCases(_Storage(None), _MediaUrls()).delete(
        context,
        1,
        "inactive",
    )
    assert deleted.as_dict() == {"pool_id": "inactive"}

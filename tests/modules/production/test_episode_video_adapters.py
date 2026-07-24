from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_video import (
    EpisodeVideoCompositionTask,
)
from ai_anime.modules.production.infrastructure import episode_video
from ai_anime.modules.production.infrastructure.episode_video import (
    LocalFinalEpisodeVideoCatalog,
    SqliteEpisodeBeatSource,
    TaskBackendEpisodeVideoScheduler,
)


@pytest.mark.asyncio
async def test_sqlite_beat_source_reads_episode_and_closes_store(monkeypatch) -> None:
    calls: list[tuple[str, object]] = []

    class _Store:
        async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
            calls.append(("read", episode_num))
            return [{"beat_number": 1}]

        async def close(self) -> None:
            calls.append(("close", None))

    context = SimpleNamespace(project_id="proj-1")

    async def make_store(candidate):
        assert candidate is context
        return _Store()

    monkeypatch.setattr(
        episode_video.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    result = await SqliteEpisodeBeatSource().for_episode(context, 2)

    assert result == [{"beat_number": 1}]
    assert calls == [("read", 2), ("close", None)]


@pytest.mark.asyncio
async def test_task_scheduler_preserves_backend_payload_and_queue() -> None:
    calls: list[tuple[object, dict]] = []

    class _Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="inline",
                queue="inline",
            )

    context = SimpleNamespace(project_id="proj-1")
    task = EpisodeVideoCompositionTask(
        episode_num=2,
        output_dir=Path("project"),
        beats=[{"beat_number": 1}],
        add_subtitles=True,
        add_bgm=False,
        resolution="720x1280",
    )

    receipt = await TaskBackendEpisodeVideoScheduler(lambda: _Backend()).enqueue(
        context,
        task,
    )

    assert receipt.task_id == "task-1"
    assert receipt.task_key == "task:compose_episode:project:proj-1:2"
    assert receipt.backend == "inline"
    assert receipt.queue == "inline"
    assert calls == [
        (
            context,
            {
                "task_type": "compose_episode",
                "queue_kind": "ffmpeg",
                "episode": 2,
                "payload": task.backend_payload(),
            },
        )
    ]


def test_final_video_catalog_reports_missing_and_existing_file(
    monkeypatch,
    tmp_path: Path,
) -> None:
    context = SimpleNamespace(project_id="proj-1", output_dir=tmp_path)
    catalog = LocalFinalEpisodeVideoCatalog()

    missing = catalog.status(context, 2)

    assert missing.as_dict() == {
        "exists": False,
        "filename": "ep002_final.mp4",
    }

    final_path = tmp_path / "videos" / "episodes" / "ep002_final.mp4"
    final_path.parent.mkdir(parents=True)
    final_path.write_bytes(b"video")
    url_calls: list[tuple[object, str, Path]] = []

    def static_url(candidate, relative_path: str, *, local_path: Path) -> str:
        url_calls.append((candidate, relative_path, local_path))
        return "/static/projects/proj-1/videos/episodes/ep002_final.mp4"

    monkeypatch.setattr(
        episode_video.project_media,
        "make_project_static_url",
        static_url,
    )

    existing = catalog.status(context, 2)

    assert existing.as_dict() == {
        "exists": True,
        "filename": "ep002_final.mp4",
        "video_url": "/static/projects/proj-1/videos/episodes/ep002_final.mp4",
    }
    assert url_calls == [
        (context, "videos/episodes/ep002_final.mp4", final_path)
    ]

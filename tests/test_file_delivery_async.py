from __future__ import annotations

import threading
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_project_file_resolution_runs_off_the_event_loop_thread(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api import file_delivery

    media = tmp_path / "media" / "video.mp4"
    media.parent.mkdir()
    media.write_bytes(b"video")
    event_loop_thread = threading.get_ident()
    resolve_threads: list[int] = []

    async def resolve_project_scope(*_args, **_kwargs):
        return SimpleNamespace(project_dir=tmp_path)

    class Queries:
        def resolve(self, **_kwargs):
            resolve_threads.append(threading.get_ident())
            return SimpleNamespace(
                path=media,
                redirect_url=None,
                download_name=None,
            )

    monkeypatch.setattr(file_delivery, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(file_delivery, "project_file_queries", lambda: Queries())

    response = await file_delivery.serve_project_file(
        project="project-1",
        file_path="media/video.mp4",
        user={"username": "viewer"},
        as_download=False,
    )

    assert response.path == str(media)
    assert resolve_threads and resolve_threads[0] != event_loop_thread

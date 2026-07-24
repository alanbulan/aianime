from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.global_video_optimization import (
    GlobalVideoOptimizationTask,
)
from ai_anime.modules.production.infrastructure.global_video_optimization import (
    LocalEpisodeSketchCatalog,
    SqliteGlobalVideoOptimizationSource,
    TaskBackendGlobalVideoOptimizationScheduler,
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
        home_node_id="node-a",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_sqlite_source_projects_characters_and_closes_store(
    monkeypatch,
    tmp_path,
) -> None:
    from ai_anime.modules.production.infrastructure import global_video_optimization

    class Store:
        closed = False

        async def get_beats_as_dicts(self, episode_num):
            assert episode_num == 3
            return [{"beat_number": 1}]

        def get_all_characters(self):
            return [
                SimpleNamespace(
                    name="A",
                    gender="female",
                    role="lead",
                    face_prompt="portrait",
                )
            ]

        async def close(self):
            self.closed = True

    store = Store()

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        global_video_optimization.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    materials = await SqliteGlobalVideoOptimizationSource().load(
        _context(tmp_path),
        3,
    )

    assert materials.beats == [{"beat_number": 1}]
    assert materials.characters == [
        {
            "name": "A",
            "gender": "female",
            "body_type": "",
            "role": "lead",
            "is_main": False,
            "face_prompt": "portrait",
        }
    ]
    assert store.closed is True


@pytest.mark.asyncio
async def test_sqlite_source_skips_characters_when_episode_has_no_beats(
    monkeypatch,
    tmp_path,
) -> None:
    from ai_anime.modules.production.infrastructure import global_video_optimization

    class Store:
        closed = False

        async def get_beats_as_dicts(self, _episode_num):
            return []

        def get_all_characters(self):
            raise AssertionError("characters must not be read for an empty episode")

        async def close(self):
            self.closed = True

    store = Store()

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        global_video_optimization.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    materials = await SqliteGlobalVideoOptimizationSource().load(
        _context(tmp_path),
        3,
    )

    assert materials.beats == []
    assert materials.characters == []
    assert store.closed is True


def test_local_sketch_catalog_requires_matching_png(tmp_path: Path) -> None:
    context = _context(tmp_path)
    sketches_dir = Path(context.output_dir) / "sketches" / "ep003"
    sketches_dir.mkdir(parents=True)
    (sketches_dir / "beat_01.jpg").write_bytes(b"jpg")
    catalog = LocalEpisodeSketchCatalog()

    assert catalog.has_any(context, 3) is False
    (sketches_dir / "beat_01.png").write_bytes(b"png")
    assert catalog.has_any(context, 3) is True


@pytest.mark.asyncio
async def test_task_backend_scheduler_preserves_payload_and_identity(tmp_path: Path) -> None:
    calls = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="node.node-a.default",
            )

    context = _context(tmp_path)
    task = GlobalVideoOptimizationTask(
        episode_num=3,
        beats=[{"beat_number": 1}],
        characters=[{"name": "A"}],
        output_dir=context.output_dir,
        language="en",
    )

    receipt = await TaskBackendGlobalVideoOptimizationScheduler(
        lambda: Backend()
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "global_optimize_video",
                "queue_kind": "default",
                "episode": 3,
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.task_id == "task-1"
    assert receipt.task_key == (
        "task:global_optimize_video:project:proj_video_123:3"
    )
    assert receipt.backend == "celery"
    assert receipt.queue == "node.node-a.default"

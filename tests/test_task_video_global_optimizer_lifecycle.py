from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext


def _project_ctx(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="admin",
        requester_user_id="user_editor",
        requester_username="admin",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="node_a",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_global_optimizer_collects_one_current_frame_per_shot_without_grid(tmp_path):
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        _collect_current_frame_paths,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    paths = PathResolver(str(tmp_path), 1)
    render_41 = paths.frame(41)
    sketch_2 = paths.sketch(2)
    stale_sketch_41 = paths.sketch(41)
    for path in (render_41, sketch_2, stale_sketch_41):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"image")

    selected = _collect_current_frame_paths(
        paths,
        [{"beat_number": 41}, {"beat_number": 2}],
    )

    assert selected == [str(render_41), str(sketch_2)]
    assert not list(tmp_path.rglob("_global_opt_grid_*.png"))


@pytest.mark.asyncio
async def test_global_optimize_video_closes_cognee_store_on_success(monkeypatch, tmp_path):
    from ai_anime.modules.task_execution.infrastructure.runners import video
    from ai_anime.shared.infrastructure import project_stores
    from ai_anime.shared.utils.path_resolver import PathResolver

    sketch_path = PathResolver(str(tmp_path), 1).sketch(1)
    sketch_path.parent.mkdir(parents=True, exist_ok=True)
    sketch_path.write_bytes(b"fake-png")

    calls: list[str] = []
    languages: list[str] = []

    class FakeTaskManager:
        def update_progress_for_project(self, *args, **kwargs):
            return None

    class FakeCogneeStore:
        def __init__(self, *args, **kwargs):
            calls.append("init")

        async def initialize(self):
            calls.append("initialize")

        async def load_graph_state(self):
            calls.append("load_graph_state")

        async def update_beat_asset(self, **kwargs):
            calls.append("update_beat_asset")
            return True

        async def close(self):
            calls.append("close")

    class FakeOptimizer:
        async def optimize_single_beat(self, **kwargs):
            languages.append(kwargs["language"])
            return {"prompt": "optimized prompt"}

    async def fake_make_cognee_store_for_context(*args, **kwargs):
        store = FakeCogneeStore()
        await store.initialize()
        await store.load_graph_state()
        return store

    monkeypatch.setattr(video, "get_task_manager", lambda: FakeTaskManager())
    monkeypatch.setattr(
        project_stores,
        "make_cognee_store_for_context",
        fake_make_cognee_store_for_context,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.prepare_global_optimizer_input",
        lambda **kwargs: ([str(sketch_path)], {}, 1),
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_global_video_optimizer",
        lambda: FakeOptimizer(),
    )

    result = await video._run_global_optimize_video_async(
        {
            "episode": 1,
            "payload": {
                "episode": 1,
                "beats": [{"beat_number": 1, "visual_description": "frame"}],
                "characters": [],
                "output_dir": str(tmp_path),
            },
        },
        _project_ctx(tmp_path),
    )

    assert result["optimized"] == 1
    assert languages == ["en"]
    assert calls == [
        "init",
        "initialize",
        "load_graph_state",
        "update_beat_asset",
        "close",
    ]


@pytest.mark.asyncio
async def test_global_optimize_video_preserves_planned_keyframe_mode(
    monkeypatch,
    tmp_path,
):
    from ai_anime.modules.task_execution.infrastructure.runners import video
    from ai_anime.shared.infrastructure import project_stores
    from ai_anime.shared.utils.path_resolver import PathResolver

    paths = PathResolver(str(tmp_path), 1)
    for beat_number in (1, 41, 2):
        sketch_path = paths.sketch(beat_number)
        sketch_path.parent.mkdir(parents=True, exist_ok=True)
        sketch_path.write_bytes(b"fake-png")
        frame_path = paths.frame(beat_number)
        frame_path.parent.mkdir(parents=True, exist_ok=True)
        frame_path.write_bytes(b"fake-render")

    calls: list[object] = []

    class FakeTaskManager:
        def update_progress_for_project(self, *args, **kwargs):
            return None

    class FakeCogneeStore:
        async def update_beat_asset(self, **kwargs):
            calls.append(("update", kwargs))
            return True

        async def close(self):
            calls.append("close")

    class FakeOptimizer:
        async def optimize_single_beat(self, **kwargs):
            calls.append(
                (
                    "first_frame",
                    kwargs["beat"]["beat_number"],
                    kwargs["sketch_image_path"],
                    kwargs["beat_position"],
                )
            )
            return {"prompt": "first-frame prompt"}

    async def fake_make_cognee_store_for_context(*args, **kwargs):
        return FakeCogneeStore()

    async def fake_generate_and_save(store, **kwargs):
        calls.append(("keyframe", kwargs["beat_num"]))
        return SimpleNamespace(prompt="first-last transition")

    monkeypatch.setattr(video, "get_task_manager", lambda: FakeTaskManager())
    monkeypatch.setattr(
        project_stores,
        "make_cognee_store_for_context",
        fake_make_cognee_store_for_context,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.prepare_global_optimizer_input",
        lambda **kwargs: (
            [str(paths.sketch(1)), str(paths.sketch(41)), str(paths.sketch(2))],
            {},
            3,
        ),
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_global_video_optimizer",
        lambda: FakeOptimizer(),
    )
    monkeypatch.setattr(
        "ai_anime.modules.narrative_planning.public.generate_and_save_beat_video_prompt",
        fake_generate_and_save,
    )

    beats = [
        {
            "beat_number": 1,
            "shot_order": 10,
            "visual_description": "start",
            "video_mode": "keyframe",
        },
        {
            "beat_number": 41,
            "shot_order": 15,
            "visual_description": "inserted shot",
            "video_mode": "first_frame",
        },
        {
            "beat_number": 2,
            "shot_order": 20,
            "visual_description": "end",
            "video_mode": "first_frame",
        },
    ]
    result = await video._run_global_optimize_video_async(
        {
            "episode": 1,
            "payload": {
                "episode": 1,
                "beats": beats,
                "characters": [],
                "output_dir": str(tmp_path),
            },
        },
        _project_ctx(tmp_path),
    )

    assert result["optimized"] == 3
    assert beats[0]["video_mode"] == "keyframe"
    assert beats[0]["keyframe_prompt"] == "first-last transition"
    assert ("keyframe", 1) in calls
    assert ("first_frame", 41, str(paths.frame(41)), 2) in calls
    assert ("first_frame", 2, str(paths.frame(2)), 3) in calls
    ordered_kinds = [
        (call[0], call[1])
        for call in calls
        if isinstance(call, tuple) and call[0] in {"keyframe", "first_frame"}
    ]
    assert ordered_kinds == [
        ("keyframe", 1),
        ("first_frame", 41),
        ("first_frame", 2),
    ]
    assert not any(
        isinstance(call, tuple)
        and call[0] == "update"
        and call[1].get("beat_number") == 1
        for call in calls
    )
    assert calls[-1] == "close"


@pytest.mark.asyncio
async def test_global_optimize_video_closes_cognee_store_on_failure(monkeypatch, tmp_path):
    from ai_anime.modules.task_execution.infrastructure.runners import video
    from ai_anime.shared.infrastructure import project_stores
    from ai_anime.shared.utils.path_resolver import PathResolver

    sketch_path = PathResolver(str(tmp_path), 1).sketch(1)
    sketch_path.parent.mkdir(parents=True, exist_ok=True)
    sketch_path.write_bytes(b"fake-png")

    calls: list[str] = []

    class FakeTaskManager:
        def update_progress_for_project(self, *args, **kwargs):
            return None

    class FakeCogneeStore:
        def __init__(self, *args, **kwargs):
            calls.append("init")

        async def initialize(self):
            calls.append("initialize")

        async def load_graph_state(self):
            calls.append("load_graph_state")

        async def close(self):
            calls.append("close")

    class FakeOptimizer:
        async def optimize_single_beat(self, **kwargs):
            calls.append("optimize_single_beat")
            raise RuntimeError("model unavailable")

    async def fake_make_cognee_store_for_context(*args, **kwargs):
        store = FakeCogneeStore()
        await store.initialize()
        await store.load_graph_state()
        return store

    monkeypatch.setattr(video, "get_task_manager", lambda: FakeTaskManager())
    monkeypatch.setattr(
        project_stores,
        "make_cognee_store_for_context",
        fake_make_cognee_store_for_context,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.prepare_global_optimizer_input",
        lambda **kwargs: ([str(sketch_path)], {}, 1),
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_global_video_optimizer",
        lambda: FakeOptimizer(),
    )

    with pytest.raises(RuntimeError, match="model unavailable"):
        await video._run_global_optimize_video_async(
            {
                "episode": 1,
                "payload": {
                    "episode": 1,
                    "beats": [{"beat_number": 1, "visual_description": "frame"}],
                    "characters": [],
                    "output_dir": str(tmp_path),
                },
            },
            _project_ctx(tmp_path),
        )

    assert calls == [
        "init",
        "initialize",
        "load_graph_state",
        "optimize_single_beat",
        "close",
    ]

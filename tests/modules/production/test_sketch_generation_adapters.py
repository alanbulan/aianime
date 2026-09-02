from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.sketch_generation import (
    GenerateSketchesCommand,
    SketchGenerationRejected,
    SketchGenerationTask,
)
from ai_anime.modules.production.infrastructure.sketch_generation import (
    LocalSketchGenerationPreparer,
    SketchGridPlanner,
    TaskExecutionSketchGenerationScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


class _Store:
    def __init__(
        self,
        beats: list[dict],
        sketch_colors: dict[str, str] | None = None,
    ) -> None:
        self.beats = beats
        self.sketch_colors = sketch_colors or {}
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int):
        assert episode_num == 3
        return self.beats

    def get_sketch_colors(self, episode_num: int):
        assert episode_num == 3
        return self.sketch_colors

    async def close(self) -> None:
        self.close_calls += 1


class _Settings:
    def __init__(self) -> None:
        self.calls = []

    def load(self, username: str, project: str):
        self.calls.append((username, project))
        return {
            "visual_style": "cinematic",
            "sketch_image_selection": "configured-selection",
        }


class _ImageSettings:
    def __init__(self) -> None:
        self.calls = []

    def resolve_sketch_selection(self, project_config, requested_selection=None):
        self.calls.append((project_config, requested_selection))
        return "image-model-a"


class _GenerationContext:
    def __init__(self, character_map: dict) -> None:
        self.character_map = character_map
        self.calls = []

    async def build_character_map(self, **kwargs):
        self.calls.append(kwargs)
        return self.character_map

    def episode_or_none(self, episode_num: int):
        assert episode_num == 3
        return "episode-3"


class _PropMenus:
    def __init__(self) -> None:
        self.calls = []

    async def for_episode(self, store, episode, beats):
        self.calls.append((store, episode, beats))
        return [{"prop_id": "prop-1"}]


class _GridPlanner:
    def __init__(self, plan=((1, 1), (2, 2))) -> None:
        self.grid_plan = plan
        self.calls = []

    def plan(self, beats, *, scene_grouping: bool, aspect_ratio: str):
        self.calls.append((beats, scene_grouping, aspect_ratio))
        return self.grid_plan


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def _build_preparer(
    monkeypatch,
    store: _Store,
    *,
    character_map: dict | None = None,
    plan=((1, 1), (2, 2)),
):
    from ai_anime.modules.production.infrastructure import sketch_generation
    from ai_anime.modules.production.infrastructure import visual_asset_readiness

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        sketch_generation.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    async def inspect_ready(*_args, **_kwargs):
        return SimpleNamespace(
            ready_for_sketches=True,
            rejection_message=lambda: "",
        )

    monkeypatch.setattr(
        visual_asset_readiness,
        "inspect_project_episode_visual_assets",
        inspect_ready,
    )
    settings = _Settings()
    image_settings = _ImageSettings()
    generation_context = _GenerationContext(
        character_map
        if character_map is not None
        else {"hero": {"sketch_color": "#3366ff"}}
    )
    props = _PropMenus()
    planner = _GridPlanner(plan)
    preparer = LocalSketchGenerationPreparer(
        settings,
        image_settings,
        lambda _store, _context: generation_context,
        props,
        planner,
    )
    return (
        preparer,
        settings,
        image_settings,
        generation_context,
        props,
        planner,
    )


@pytest.mark.asyncio
async def test_standalone_sketch_preparation_does_not_generate_voices(
    monkeypatch, tmp_path: Path,
) -> None:
    from ai_anime.modules.production import public as production_public

    async def unexpected_voice_call(*_args, **_kwargs):
        raise AssertionError("a standalone sketch must not prepare audio or voices")

    monkeypatch.setattr(production_public, "build_episode_audio_generation_plan", unexpected_voice_call)
    monkeypatch.setattr(production_public, "provision_voice_design_requirements", unexpected_voice_call)
    store = _Store([{"beat_number": 1, "speaker": "hero"}], {"hero": "#3366ff"})
    preparer, *_ = _build_preparer(monkeypatch, store, plan=((1, 1),))

    await preparer.prepare(_context(tmp_path), GenerateSketchesCommand(episode_num=3))

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_missing_beats_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([])
    preparer, *_ = _build_preparer(monkeypatch, store)

    with pytest.raises(
        SketchGenerationRejected,
        match="No beats found for episode 3",
    ):
        await preparer.prepare(
            _context(tmp_path),
            GenerateSketchesCommand(episode_num=3),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_invalid_grid_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 1}])
    preparer, *_ = _build_preparer(monkeypatch, store, plan=((1, 1),))

    with pytest.raises(SketchGenerationRejected, match="grid_index=1 超出范围"):
        await preparer.prepare(
            _context(tmp_path),
            GenerateSketchesCommand(episode_num=3, grid_index=1),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_missing_colors(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 1}])
    result = _build_preparer(monkeypatch, store, character_map={})
    preparer = result[0]

    with pytest.raises(SketchGenerationRejected, match="未检测到颜色分配"):
        await preparer.prepare(
            _context(tmp_path),
            GenerateSketchesCommand(episode_num=3),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_incomplete_visual_assets(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import visual_asset_readiness

    store = _Store([{"beat_number": 1}], {"hero": "#3366ff"})
    preparer, *_ = _build_preparer(monkeypatch, store, plan=((1, 1),))

    async def inspect_incomplete(*_args, **_kwargs):
        return SimpleNamespace(
            ready_for_sketches=False,
            rejection_message=lambda: "草图生成前置资产未就绪：场景主视图缺失：办公室",
        )

    monkeypatch.setattr(
        visual_asset_readiness,
        "inspect_project_episode_visual_assets",
        inspect_incomplete,
    )

    with pytest.raises(SketchGenerationRejected, match="场景主视图缺失：办公室"):
        await preparer.prepare(
            _context(tmp_path),
            GenerateSketchesCommand(episode_num=3),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_builds_all_grid_tasks_with_existing_materials(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "location": "A"},
        {"beat_number": 2, "location": "B"},
    ]
    store = _Store(beats, {"hero-young": "#3366ff"})
    (
        preparer,
        settings,
        image_settings,
        generation_context,
        props,
        planner,
    ) = _build_preparer(monkeypatch, store)
    context = _context(tmp_path)

    prepared = await preparer.prepare(
        context,
        GenerateSketchesCommand(
            episode_num=3,
            grid_index=-1,
            sketch_scene_grouping=True,
            aspect_ratio="16:9",
            image_generation_selection="image-model-a",
        ),
    )

    assert settings.calls == [("alice", "demo")]
    assert planner.calls == [(beats, True, "16:9")]
    assert generation_context.calls == [
        {
            "beats": beats,
            "project": "demo",
            "episode_num": 3,
            "use_detected_identities": False,
        }
    ]
    assert props.calls == [(store, "episode-3", beats)]
    assert image_settings.calls[0][1] == "image-model-a"
    assert prepared.grid_plan == ((1, 1), (2, 2))
    assert [task.grid_index for task in prepared.tasks] == [0, 1]
    assert prepared.tasks[0].config == {
        "beats": beats,
        "character_map": {"hero": {"sketch_color": "#3366ff"}},
        "style": "cinematic",
        "model": "image-model-a",
        "sketch_scene_grouping": True,
        "aspect_ratio": "16:9",
        "replace_existing": False,
        "sketch_colors": {"hero-young": "#3366ff"},
        "prop_menu": [{"prop_id": "prop-1"}],
    }
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_marks_explicit_replacement(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 1}], {"hero": "#3366ff"})
    result = _build_preparer(monkeypatch, store, plan=((1, 1),))
    preparer = result[0]

    prepared = await preparer.prepare(
        _context(tmp_path),
        GenerateSketchesCommand(episode_num=3, replace_existing=True),
    )

    assert prepared.tasks[0].config["replace_existing"] is True


def test_image_grid_planner_preserves_scene_aspect_and_linear_plan(
    monkeypatch,
) -> None:
    scene_calls = []

    def scene_plan(beats, aspect_ratio="2:3"):
        scene_calls.append((beats, aspect_ratio))
        return [{"rows": 1, "cols": 2}]

    monkeypatch.setattr(
        "ai_anime.modules.production.infrastructure.media_generation.image_grid.sketch_scene_grid_split",
        scene_plan,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.infrastructure.media_generation.image_grid.sketch_grid_split",
        lambda total: [(1, total)],
    )
    beats = [{"beat_number": 1}, {"beat_number": 2}]
    planner = SketchGridPlanner()

    assert planner.plan(
        beats,
        scene_grouping=True,
        aspect_ratio="16:9",
    ) == ((1, 2),)
    assert scene_calls == [(beats, "16:9")]
    assert planner.plan(
        beats,
        scene_grouping=False,
        aspect_ratio="2:3",
    ) == ((1, 2),)


@pytest.mark.asyncio
async def test_task_execution_scheduler_preserves_sketch_generation_contract(
    tmp_path: Path,
) -> None:
    calls = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="default",
            )

    context = _context(tmp_path)
    task = SketchGenerationTask(
        episode_num=3,
        grid_index=1,
        output_dir=tmp_path,
        config={"style": "cinematic"},
    )

    receipt = await TaskExecutionSketchGenerationScheduler(
        ProjectTaskSubmissionUseCases(lambda: Backend())
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "sketch_generation",
                "queue_kind": "default",
                "episode": 3,
                "scope": "grid_1",
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.grid_index == 1
    assert receipt.scope == "grid_1"
    assert receipt.task_id == "task-1"
    assert receipt.task_key == (
        "task:sketch_generation:project:proj-1:3:grid_1"
    )
    assert receipt.backend == "celery"
    assert receipt.queue == "default"

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.public import NO_CHARACTER_MARKER
from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationRejected,
    GridRegenerationTask,
    RegenerateGridCommand,
)
from ai_anime.modules.production.infrastructure.grid_regeneration import (
    LocalGridRegenerationPreparer,
    NanoBananaGridRegenerationPlanner,
    TaskExecutionGridRegenerationScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int):
        assert episode_num == 2
        return self.beats

    async def close(self) -> None:
        self.close_calls += 1


class _Settings:
    def load(self, username: str, project: str):
        assert (username, project) == ("alice", "demo")
        return {"visual_style": "cinematic"}


class _ImageSettings:
    def __init__(self) -> None:
        self.calls = []

    def resolve_render_selection(self, config, requested=None):
        self.calls.append(("render", config, requested))
        return "render-selection"

    def resolve_sketch_aspect_padding(self, config, requested=None):
        self.calls.append(("padding", config, requested))
        return True


class _GenerationContext:
    def __init__(self) -> None:
        self.calls = []

    async def build_character_map(self, **kwargs):
        self.calls.append(kwargs)
        return {"hero": {"ref_path": "hero.png"}}


class _Planner:
    def __init__(self, beat_numbers: tuple[int, ...]) -> None:
        self.beat_numbers = beat_numbers
        self.calls = []

    def selected_beat_numbers(self, beats, character_map, **kwargs):
        self.calls.append((beats, character_map, kwargs))
        return self.beat_numbers


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


def _build(monkeypatch, store: _Store, planner: _Planner):
    from ai_anime.modules.production.infrastructure import grid_regeneration

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        grid_regeneration.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    image_settings = _ImageSettings()
    generation_context = _GenerationContext()
    preparer = LocalGridRegenerationPreparer(
        _Settings(),
        image_settings,
        lambda _store, _context: generation_context,
        planner,
    )
    return preparer, image_settings, generation_context


def test_planner_uses_character_grouping_before_scene_grouping(monkeypatch) -> None:
    from ai_anime.generators import nanobanana_grid

    beats = [{"beat_number": 1}, {"beat_number": 2}]
    monkeypatch.setattr(
        nanobanana_grid,
        "character_grid_split",
        lambda _beats, _character_map: [
            {
                "rows": 1,
                "cols": 2,
                "composite_count": 2,
                "beat_numbers": [2, 1],
            }
        ],
    )
    monkeypatch.setattr(
        nanobanana_grid,
        "scene_grid_split",
        lambda *_args, **_kwargs: pytest.fail("不应调用场景分组"),
    )
    planner = NanoBananaGridRegenerationPlanner()

    assert planner.selected_beat_numbers(
        beats,
        {},
        grid_index=0,
        scene_grouping=True,
        character_grouping=True,
    ) == (2, 1)
    with pytest.raises(
        GridRegenerationRejected,
        match=r"角色分组方案: 1x2\(comp=2\).*0~0",
    ):
        planner.selected_beat_numbers(
            beats,
            {},
            grid_index=1,
            scene_grouping=True,
            character_grouping=True,
        )


def test_planner_selects_scene_group_and_reports_its_range(monkeypatch) -> None:
    from ai_anime.generators import nanobanana_grid

    beats = [{"beat_number": 1}, {"beat_number": 2}]
    monkeypatch.setattr(
        nanobanana_grid,
        "scene_grid_split",
        lambda _beats, character_map=None: [
            {
                "rows": 1,
                "cols": 1,
                "scene_id": "A",
                "beat_numbers": [2],
            }
        ],
    )
    planner = NanoBananaGridRegenerationPlanner()

    assert planner.selected_beat_numbers(
        beats,
        {},
        grid_index=0,
        scene_grouping=True,
        character_grouping=False,
    ) == (2,)
    with pytest.raises(
        GridRegenerationRejected,
        match=r"场景分组方案: 1x1\(A\).*0~0",
    ):
        planner.selected_beat_numbers(
            beats,
            {},
            grid_index=-1,
            scene_grouping=True,
            character_grouping=False,
        )


def test_planner_selects_sequential_grid_beats(monkeypatch) -> None:
    from ai_anime.generators import nanobanana_grid

    beats = [
        {"beat_number": 10},
        {"beat_number": 20},
        {"beat_number": 30},
    ]
    monkeypatch.setattr(
        nanobanana_grid,
        "perfect_grid_split",
        lambda _count: ["1x2_4-3", "1x1_2-3"],
    )
    planner = NanoBananaGridRegenerationPlanner()

    assert planner.selected_beat_numbers(
        beats,
        {},
        grid_index=1,
        scene_grouping=False,
        character_grouping=False,
    ) == (30,)
    with pytest.raises(
        GridRegenerationRejected,
        match=r"共 3 个 beats，分割方案: 1x2 \+ 1x1.*0~1",
    ):
        planner.selected_beat_numbers(
            beats,
            {},
            grid_index=2,
            scene_grouping=False,
            character_grouping=False,
        )


@pytest.mark.asyncio
async def test_preparer_checks_only_selected_grid_beats_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "detected_identities": []},
        {"beat_number": 2, "detected_identities": [NO_CHARACTER_MARKER]},
    ]
    store = _Store(beats)
    planner = _Planner((2,))
    preparer, image_settings, generation_context = _build(
        monkeypatch,
        store,
        planner,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        RegenerateGridCommand(
            episode_num=2,
            grid_index=0,
            scene_grouping=True,
            image_generation_selection="requested-render",
            sketch_aspect_padding=True,
        ),
    )

    assert generation_context.calls == [
        {
            "beats": beats,
            "project": "demo",
            "episode_num": 2,
            "use_detected_identities": True,
        }
    ]
    assert planner.calls == [
        (
            beats,
            {"hero": {"ref_path": "hero.png"}},
            {
                "grid_index": 0,
                "scene_grouping": True,
                "character_grouping": False,
            },
        )
    ]
    assert image_settings.calls == [
        ("render", {"visual_style": "cinematic"}, "requested-render"),
        ("padding", {"visual_style": "cinematic"}, True),
    ]
    assert task.config == {
            "beats": beats,
            "character_map": {"hero": {"ref_path": "hero.png"}},
            "style": "cinematic",
            "model": "render-selection",
            "render_mode": "Render",
        "scene_grouping": True,
        "character_grouping": False,
        "sketch_aspect_padding": True,
    }
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_undetected_target_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 1, "detected_identities": []}])
    preparer, *_ = _build(monkeypatch, store, _Planner((1,)))

    with pytest.raises(
        GridRegenerationRejected,
        match=r"以下 beat 尚未检测/标注：#1",
    ):
        await preparer.prepare(
            _context(tmp_path),
            RegenerateGridCommand(episode_num=2, grid_index=0),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_scheduler_preserves_grid_regeneration_contract(
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
    task = GridRegenerationTask(
        episode_num=2,
        grid_index=3,
        output_dir=tmp_path,
        config={"render_mode": "Render"},
    )

    receipt = await TaskExecutionGridRegenerationScheduler(
        ProjectTaskSubmissionUseCases(lambda: Backend())
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "grid_regenerate",
                "queue_kind": "default",
                "episode": 2,
                "scope": "grid_3",
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.scope == "grid_3"
    assert receipt.task_id == "task-1"
    assert receipt.task_key == "task:grid_regenerate:project:proj-1:2:grid_3"
    assert receipt.backend == "celery"
    assert receipt.queue == "default"

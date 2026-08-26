from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.public import NO_CHARACTER_MARKER
from ai_anime.modules.production.application.selected_regeneration import (
    RegenerateSelectedBeatsCommand,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationTask,
)
from ai_anime.modules.production.infrastructure.selected_regeneration import (
    LocalSelectedRegenerationPreparer,
    TaskExecutionSelectedRegenerationScheduler,
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

    def get_sketch_colors(self, episode_num: int):
        assert episode_num == 2
        return {"hero": "#ffffff"}

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

    def resolve_sketch_selection(self, config, requested=None):
        self.calls.append(("sketch", config, requested))
        return "sketch-selection"

    def resolve_sketch_aspect_padding(self, config, requested=None):
        self.calls.append(("padding", config, requested))
        return True


class _GenerationContext:
    def __init__(self) -> None:
        self.calls = []

    async def build_character_map(self, **kwargs):
        self.calls.append(kwargs)
        return {"hero": {"ref_path": "hero.png"}}

    def episode_or_none(self, episode_num: int):
        assert episode_num == 2
        return "episode-2"


class _PropMenus:
    def __init__(self) -> None:
        self.calls = []

    async def for_episode(self, store, episode, beats):
        self.calls.append((store, episode, beats))
        return [{"prop_id": "prop-1"}]


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


def _build(monkeypatch, store: _Store):
    from ai_anime.modules.production.infrastructure import selected_regeneration

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        selected_regeneration.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    image_settings = _ImageSettings()
    generation_context = _GenerationContext()
    props = _PropMenus()
    preparer = LocalSelectedRegenerationPreparer(
        _Settings(),
        image_settings,
        lambda _store, _context: generation_context,
        props,
    )
    return preparer, image_settings, generation_context, props


@pytest.mark.asyncio
async def test_preparer_rejects_invalid_selection_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([{"beat_number": 1}])
    preparer, *_ = _build(monkeypatch, store)

    with pytest.raises(
        SelectedRegenerationRejected,
        match=r"beat_indices \[2\] 超出范围",
    ):
        await preparer.prepare(
            _context(tmp_path),
            RegenerateSelectedBeatsCommand(
                kind=SelectedRegenerationKind.SKETCH,
                episode_num=2,
                beat_indices=(2,),
            ),
        )

    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_render_preparer_checks_and_maps_only_selected_beats(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "detected_identities": []},
        {"beat_number": 2, "detected_identities": [NO_CHARACTER_MARKER]},
    ]
    store = _Store(beats)
    preparer, image_settings, generation_context, props = _build(
        monkeypatch,
        store,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        RegenerateSelectedBeatsCommand(
            kind=SelectedRegenerationKind.RENDER,
            episode_num=2,
            beat_indices=(2,),
            image_generation_selection="requested-render",
            sketch_aspect_padding=True,
        ),
    )

    assert generation_context.calls == [
        {
            "beats": [beats[1]],
            "project": "demo",
            "episode_num": 2,
            "use_detected_identities": True,
        }
    ]
    assert image_settings.calls[0][0] == "render"
    assert image_settings.calls[0][2] == "requested-render"
    assert image_settings.calls[1][0] == "padding"
    assert props.calls == [(store, "episode-2", beats)]
    assert task.kind is SelectedRegenerationKind.RENDER
    assert task.config == {
            "beats": beats,
            "character_map": {"hero": {"ref_path": "hero.png"}},
            "style": "cinematic",
            "model": "render-selection",
            "selected_beat_numbers": [2],
        "sketch_colors": {"hero": "#ffffff"},
        "prop_menu": [{"prop_id": "prop-1"}],
        "sketch_aspect_padding": True,
    }
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_sketch_preparer_uses_all_beats_without_render_padding(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "detected_identities": []},
        {"beat_number": 2, "detected_identities": []},
    ]
    store = _Store(beats)
    preparer, image_settings, generation_context, _props = _build(
        monkeypatch,
        store,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        RegenerateSelectedBeatsCommand(
            kind=SelectedRegenerationKind.SKETCH,
            episode_num=2,
            beat_indices=(2, 1),
            mode_key="1x2_4-3_sketch",
            image_generation_selection="requested-sketch",
        ),
    )

    assert generation_context.calls[0]["beats"] is beats
    assert generation_context.calls[0]["use_detected_identities"] is False
    assert image_settings.calls == [
        ("sketch", {"visual_style": "cinematic"}, "requested-sketch")
    ]
    assert task.kind is SelectedRegenerationKind.SKETCH
    assert task.mode_key == "1x2_4-3_sketch"
    assert task.config["selected_beat_numbers"] == [2, 1]
    assert "sketch_aspect_padding" not in task.config
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_sketch_preparer_accepts_existing_nonsequential_beat_number(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "detected_identities": []},
        {
            "beat_number": 41,
            "is_manual_shot": True,
            "detected_identities": [],
        },
    ]
    store = _Store(beats)
    preparer, _image_settings, _generation_context, _props = _build(
        monkeypatch,
        store,
    )

    task = await preparer.prepare(
        _context(tmp_path),
        RegenerateSelectedBeatsCommand(
            kind=SelectedRegenerationKind.SKETCH,
            episode_num=2,
            beat_indices=(41,),
            mode_key="1x1_2-3_sketch",
        ),
    )

    assert task.config["selected_beat_numbers"] == [41]
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_scheduler_preserves_selected_regeneration_contract(
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
    task = SelectedRegenerationTask(
        kind=SelectedRegenerationKind.SKETCH,
        episode_num=2,
        mode_key="1x1_2-3_sketch",
        scope="scope-1",
        output_dir=tmp_path,
        config={"selected_beat_numbers": [1]},
    )

    receipt = await TaskExecutionSelectedRegenerationScheduler(
        ProjectTaskSubmissionUseCases(lambda: Backend())
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "sketch_regen",
                "queue_kind": "default",
                "episode": 2,
                "scope": "scope-1",
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.task_id == "task-1"
    assert receipt.task_key == "task:sketch_regen:project:proj-1:2:scope-1"
    assert receipt.backend == "celery"
    assert receipt.queue == "default"

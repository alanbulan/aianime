from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.public import NO_CHARACTER_MARKER
from ai_anime.modules.production.application.render_planning import (
    RenderPlanGridTask,
    RenderPlanRejected,
)
from ai_anime.modules.production.domain.render_planning import RenderPlanGrid
from ai_anime.modules.production.infrastructure.render_planning import (
    EnvironmentRenderPlanAvailability,
    LocalRenderPlanningPreparer,
    NanoBananaRenderPlanEngine,
    TaskBackendRenderPlanScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import selection_scope


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
    def __init__(self) -> None:
        self.calls = []

    def load(self, username: str, project: str):
        self.calls.append((username, project))
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
        self.character_calls = []
        self.episode_calls = []

    async def build_character_map(self, **kwargs):
        self.character_calls.append(kwargs)
        return {"hero": {"ref_path": "hero.png"}}

    def episode_or_none(self, episode_num: int):
        self.episode_calls.append(episode_num)
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
    from ai_anime.modules.production.infrastructure import render_planning

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        render_planning.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    settings = _Settings()
    image_settings = _ImageSettings()
    generation_context = _GenerationContext()
    prop_menus = _PropMenus()
    preparer = LocalRenderPlanningPreparer(
        settings,
        image_settings,
        lambda _store, _context: generation_context,
        prop_menus,
    )
    return preparer, settings, image_settings, generation_context, prop_menus


def test_environment_availability_reads_the_render_plan_flag(monkeypatch) -> None:
    availability = EnvironmentRenderPlanAvailability()

    monkeypatch.delenv("DISABLE_RENDER_PLAN_V2", raising=False)
    assert availability.is_enabled() is True
    monkeypatch.setenv("DISABLE_RENDER_PLAN_V2", "true")
    assert availability.is_enabled() is False


@pytest.mark.asyncio
async def test_preparer_maps_only_selected_beats_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {"beat_number": 1, "detected_identities": []},
        {"beat_number": 2, "detected_identities": [NO_CHARACTER_MARKER]},
    ]
    store = _Store(beats)
    preparer, settings, image_settings, generation_context, prop_menus = _build(
        monkeypatch,
        store,
    )

    materials = await preparer.prepare(
        _context(tmp_path),
        episode_num=2,
        beat_numbers=(2,),
        image_generation_selection="requested-render",
    )

    assert materials.all_beats is beats
    assert materials.selected_beats == [beats[1]]
    assert materials.character_map == {"hero": {"ref_path": "hero.png"}}
    assert materials.sketch_colors == {"hero": "#ffffff"}
    assert materials.style == "cinematic"
    assert materials.image_generation_selection == "render-selection"
    assert generation_context.character_calls == [
        {
            "beats": [beats[1]],
            "project": "demo",
            "episode_num": 2,
            "use_detected_identities": True,
        }
    ]
    assert settings.calls == [("alice", "demo")]
    assert image_settings.calls == [
        ("render", {"visual_style": "cinematic"}, "requested-render")
    ]
    assert prop_menus.calls == []
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_preparer_rejects_invalid_selection_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store(
        [{"beat_number": 1, "detected_identities": [NO_CHARACTER_MARKER]}]
    )
    preparer, *_ = _build(monkeypatch, store)

    with pytest.raises(RenderPlanRejected) as captured:
        await preparer.prepare(
            _context(tmp_path),
            episode_num=2,
            beat_numbers=(3,),
            image_generation_selection=None,
        )

    assert captured.value.as_dict() == {
        "ok": False,
        "error": "invalid_beats",
        "data": {"invalid": [3]},
    }
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_execution_materials_load_props_and_padding_after_validation(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [{"beat_number": 2}]
    store = _Store(beats)
    preparer, settings, image_settings, generation_context, prop_menus = _build(
        monkeypatch,
        store,
    )

    materials = await preparer.prepare_execution(
        _context(tmp_path),
        episode_num=2,
        all_beats=beats,
        sketch_aspect_padding=True,
    )

    assert materials.prop_menu == [{"prop_id": "prop-1"}]
    assert materials.sketch_aspect_padding is True
    assert generation_context.episode_calls == [2]
    assert prop_menus.calls == [(store, "episode-2", beats)]
    assert settings.calls == [("alice", "demo")]
    assert image_settings.calls == [
        ("padding", {"visual_style": "cinematic"}, True)
    ]
    assert store.close_calls == 1


def test_nanobanana_engine_projects_plan_hash_and_fingerprint(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import render_planning
    from ai_anime.modules.production.application.render_planning import (
        RenderPlanningMaterials,
    )

    raw_grid = SimpleNamespace(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(2,),
        location="alley",
        padding_count=0,
        reasons=("reason",),
        warnings=("warning",),
    )
    calls = []

    def build_regen_plan(**kwargs):
        calls.append(("build", kwargs))
        return [raw_grid]

    def hash_plan(plan):
        calls.append(("hash", plan))
        return "plan-hash"

    def compute_input_fingerprint(**kwargs):
        calls.append(("fingerprint", kwargs))
        return "fingerprint"

    monkeypatch.setattr(
        render_planning.nanobanana_grid,
        "build_regen_plan",
        build_regen_plan,
    )
    monkeypatch.setattr(
        render_planning.nanobanana_grid,
        "hash_plan",
        hash_plan,
    )
    monkeypatch.setattr(
        render_planning.nanobanana_grid,
        "compute_input_fingerprint",
        compute_input_fingerprint,
    )
    materials = RenderPlanningMaterials(
        all_beats=[{"beat_number": 2}],
        selected_beats=[{"beat_number": 2}],
        character_map={},
        sketch_colors={},
        style="cinematic",
        image_generation_selection="render-selection",
    )
    engine = NanoBananaRenderPlanEngine()

    plan = engine.build(
        materials,
        strategy="naive",
        aspect_mode="9:16",
        force_one_by_one=False,
    )

    assert plan == (
        RenderPlanGrid(
            mode_key="1x1_2-3",
            rows=1,
            cols=1,
            beat_numbers=(2,),
            location="alley",
            reasons=("reason",),
            warnings=("warning",),
        ),
    )
    assert engine.hash(plan) == "plan-hash"
    assert engine.fingerprint(
        _context(tmp_path),
        materials,
        strategy="naive",
        aspect_mode="9:16",
        force_one_by_one=False,
    ) == "fingerprint"
    fingerprint_call = next(call for call in calls if call[0] == "fingerprint")
    assert callable(fingerprint_call[1]["ref_image_hasher"])


@pytest.mark.asyncio
async def test_scheduler_preserves_selected_regen_task_contract(
    tmp_path: Path,
) -> None:
    calls = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(task_state=SimpleNamespace(task_id="task-1"))

    context = _context(tmp_path)
    grid = RenderPlanGrid(
        mode_key="1x1_2-3",
        rows=1,
        cols=1,
        beat_numbers=(2,),
    )
    task = RenderPlanGridTask(
        episode_num=2,
        grid=grid,
        output_dir=tmp_path,
        base_config={"beats": [{"beat_number": 2}]},
    )

    receipt = await TaskBackendRenderPlanScheduler(
        lambda: Backend()
    ).enqueue(context, task)

    assert calls == [
        (
            context,
            {
                "task_type": "selected_regen",
                "queue_kind": "default",
                "episode": 2,
                "scope": selection_scope("1x1_2-3", (2,)),
                "payload": task.backend_payload(),
            },
        )
    ]
    assert receipt.task_id == "task-1"

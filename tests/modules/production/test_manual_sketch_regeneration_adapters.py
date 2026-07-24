from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.application.manual_sketch_regeneration import (
    GenerateMissingManualSketchesCommand,
    ManualSketchRegenerationRejected,
)
from ai_anime.modules.production.infrastructure.manual_sketch_regeneration import (
    LocalManualSketchRegenerationPreparer,
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

    def resolve_sketch_selection(self, config, requested=None):
        self.calls.append((config, requested))
        return "sketch-selection"


class _GenerationContext:
    def __init__(self) -> None:
        self.calls = []

    async def build_character_map(self, **kwargs):
        self.calls.append(kwargs)
        return {"hero": {"ref_path": "hero.png"}}


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
    from ai_anime.modules.production.infrastructure import (
        manual_sketch_regeneration,
    )

    async def make_store(_context):
        return store

    monkeypatch.setattr(
        manual_sketch_regeneration.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    settings = _Settings()
    image_settings = _ImageSettings()
    generation_context = _GenerationContext()
    preparer = LocalManualSketchRegenerationPreparer(
        settings,
        image_settings,
        lambda _store, _context: generation_context,
    )
    return preparer, settings, image_settings, generation_context


@pytest.mark.asyncio
async def test_manual_sketch_preparer_rejects_missing_beats_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    store = _Store([])
    preparer, settings, *_ = _build(monkeypatch, store)

    with pytest.raises(
        ManualSketchRegenerationRejected,
        match="第 2 集没有 beats",
    ):
        await preparer.prepare(
            _context(tmp_path),
            GenerateMissingManualSketchesCommand(episode_num=2),
        )

    assert settings.calls == []
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_manual_sketch_preparer_returns_noop_before_loading_generation_materials(
    monkeypatch,
    tmp_path: Path,
) -> None:
    beats = [
        {
            "beat_number": 41,
            "shot_order": 10,
            "is_manual_shot": True,
            "scene_ref": {"scene_id": "A"},
        }
    ]
    sketches_dir = tmp_path / "sketches" / "ep002"
    sketches_dir.mkdir(parents=True)
    (sketches_dir / "beat_41.png").write_bytes(b"existing")
    store = _Store(beats)
    preparer, settings, image_settings, generation_context = _build(
        monkeypatch,
        store,
    )

    prepared = await preparer.prepare(
        _context(tmp_path),
        GenerateMissingManualSketchesCommand(episode_num=2),
    )

    assert prepared.segments == ()
    assert settings.calls == []
    assert image_settings.calls == []
    assert generation_context.calls == []
    assert store.close_calls == 1


@pytest.mark.asyncio
async def test_manual_sketch_preparer_builds_one_task_per_missing_segment(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import (
        manual_sketch_regeneration,
    )

    beats = [
        {"beat_number": 1, "shot_order": 10, "scene_ref": {"scene_id": "A"}},
        {
            "beat_number": 41,
            "shot_order": 11,
            "is_manual_shot": True,
            "scene_ref": {"scene_id": "A"},
        },
        {
            "beat_number": 42,
            "shot_order": 12,
            "is_manual_shot": True,
            "scene_ref": {"scene_id": "A"},
        },
        {"beat_number": 2, "shot_order": 20, "scene_ref": {"scene_id": "A"}},
        {
            "beat_number": 43,
            "shot_order": 21,
            "is_manual_shot": True,
            "scene_ref": {"scene_id": "B"},
        },
        {
            "beat_number": 44,
            "shot_order": 22,
            "is_manual_shot": True,
            "visual_description": "[space_map] 二楼平面图",
            "scene_ref": {"scene_id": "B"},
        },
    ]
    mode_counts = []

    def mode_key(count: int) -> str:
        mode_counts.append(count)
        return f"mode-{count}"

    monkeypatch.setattr(
        manual_sketch_regeneration,
        "choose_manual_sketch_mode_key",
        mode_key,
    )
    store = _Store(beats)
    preparer, settings, image_settings, generation_context = _build(
        monkeypatch,
        store,
    )

    prepared = await preparer.prepare(
        _context(tmp_path),
        GenerateMissingManualSketchesCommand(episode_num=2),
    )

    assert [segment.beat_numbers for segment in prepared.segments] == [
        (41, 42),
        (43,),
    ]
    assert mode_counts == [2, 1]
    assert settings.calls == [("alice", "demo")]
    assert image_settings.calls == [({"visual_style": "cinematic"}, None)]
    assert generation_context.calls == [
        {
            "beats": beats,
            "project": "demo",
            "episode_num": 2,
            "use_detected_identities": False,
        }
    ]

    first_task = prepared.segments[0].task
    assert first_task.scope == selection_scope("mode-2", (41, 42))
    assert first_task.backend_payload() == {
        "episode": 2,
        "mode_key": "mode-2",
        "output_dir": str(tmp_path),
        "config": {
            "beats": beats,
            "character_map": {"hero": {"ref_path": "hero.png"}},
            "style": "cinematic",
            "model": None,
            "image_generation_selection": "sketch-selection",
            "selected_beat_numbers": [41, 42],
            "composite_key": "mode-2:sketch",
            "sketch_colors": {"hero": "#ffffff"},
            "mode_key": "mode-2",
        },
    }
    assert prepared.segments[1].task.scope == selection_scope("mode-1", (43,))
    assert store.close_calls == 1

from __future__ import annotations

from types import SimpleNamespace

import pytest


class _TaskManager:
    def update_progress_for_project(self, *_args, **_kwargs) -> None:
        return None


class _UsageMeter:
    async def set_project_llm_usage_context(self, **_kwargs) -> None:
        return None


class _Store:
    def __init__(self) -> None:
        self.closed = False

    def get_episode(self, episode: int):
        return SimpleNamespace(number=episode)

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_episode_asset_runner_closes_store_when_planning_fails(monkeypatch) -> None:
    from ai_anime.modules.asset_world import public as asset_world_public
    from ai_anime.modules.narrative_planning import public as narrative_public
    from ai_anime.modules.task_execution.infrastructure.runners import episode_assets
    from ai_anime.shared.infrastructure import project_stores

    store = _Store()

    class Compiler:
        def __init__(self, actual_store) -> None:
            assert actual_store is store

        async def compile_episode_scenes(self, *_args, **_kwargs):
            raise RuntimeError("planner failed")

    async def make_store(*_args, **_kwargs):
        return store

    monkeypatch.setattr(project_stores, "make_cognee_store_for_context", make_store)
    monkeypatch.setattr(narrative_public, "AssetCompiler", Compiler)
    monkeypatch.setattr(
        asset_world_public,
        "promote_episode_props_to_global",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(episode_assets, "get_task_manager", lambda: _TaskManager())
    monkeypatch.setattr(episode_assets, "get_usage_meter", lambda: _UsageMeter())

    with pytest.raises(RuntimeError, match="planner failed"):
        await episode_assets._run_episode_asset_planner(
            {
                "task_type": "episode_scene_planner",
                "episode": 1,
                "payload": {"asset_kind": "scene"},
            },
            SimpleNamespace(owner_username="alice", project_name="demo"),
        )

    assert store.closed is True


@pytest.mark.asyncio
async def test_identity_runner_closes_store_when_planning_fails(monkeypatch) -> None:
    from ai_anime.modules.narrative_planning import public as narrative_public
    from ai_anime.modules.task_execution.infrastructure.runners import identity
    from ai_anime.shared.infrastructure import project_stores

    store = _Store()

    class Planner:
        def __init__(self, actual_store) -> None:
            assert actual_store is store

        async def plan_single_episode(self, *_args, **_kwargs):
            raise RuntimeError("planner failed")

    async def make_store(*_args, **_kwargs):
        return store

    monkeypatch.setattr(project_stores, "make_cognee_store_for_context", make_store)
    monkeypatch.setattr(narrative_public, "IdentityPlanner", Planner)
    monkeypatch.setattr(identity, "get_task_manager", lambda: _TaskManager())

    with pytest.raises(RuntimeError, match="planner failed"):
        await identity._run_identity_planner(
            {"episode": 1, "payload": {}},
            SimpleNamespace(),
        )

    assert store.closed is True

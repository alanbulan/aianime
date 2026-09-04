from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from ai_anime.api.routes.narrative_planning.episodes_schemas import EpisodeUpdate
from ai_anime.modules.narrative_planning.public import NovelEpisode

pytestmark = pytest.mark.m03


def test_episode_plan_route_precedes_episode_detail_route():
    from ai_anime.api.routes.narrative_planning.episodes import router

    paths = [route.path for route in router.routes]

    assert paths.index("/projects/{project}/episodes/plan") < paths.index(
        "/projects/{project}/episodes/{episode_num}"
    )


def test_episode_asset_task_scope_is_stable_per_episode_and_kind():
    from ai_anime.modules.narrative_planning.public import EpisodeAssetPlanningTask

    assert EpisodeAssetPlanningTask(4, "prop").scope == "prop_run_ep004"
    assert EpisodeAssetPlanningTask(4, "prop").scope == "prop_run_ep004"
    assert EpisodeAssetPlanningTask(4, "scene").scope == "scene_run_ep004"
    assert EpisodeAssetPlanningTask(5, "prop").scope == "prop_run_ep005"


def test_episode_update_has_one_canonical_summary_input() -> None:
    assert EpisodeUpdate(summary="新摘要").model_dump(exclude_none=True) == {
        "summary": "新摘要"
    }
    with pytest.raises(ValidationError, match="content_summary"):
        EpisodeUpdate.model_validate({"content_summary": "旧字段"})


class _EpisodeStore:
    def __init__(self, episode: NovelEpisode):
        self.episode = episode
        self.updates: list[tuple[int, dict]] = []

    def get_episode(self, number: int):
        if number == self.episode.number:
            return self.episode
        return None

    def get_all_episodes(self):
        return [self.episode]

    async def update_episode(self, episode_number: int, **updates):
        self.updates.append((episode_number, updates))
        for key, value in updates.items():
            if key == "identity_default_map":
                self.episode.identity_default_map = value
            elif hasattr(self.episode, key):
                setattr(self.episode, key, value)
        return None


def _patch_project_and_store(
    monkeypatch: pytest.MonkeyPatch,
    module,
    project_dir: Path,
    store: _EpisodeStore,
) -> None:
    ctx = SimpleNamespace(
        project_id="project_123",
        project_name="demo",
        output_dir=project_dir,
    )

    async def resolve_project_scope(project: str, user: dict, required_role: str = "viewer"):
        return SimpleNamespace(
            ctx=ctx,
            username=user.get("username", "admin"),
            project_name=project,
            project_dir=project_dir,
            output_dir=str(project_dir),
            state_dir=str(project_dir),
            runtime_dir=str(project_dir),
        )

    async def make_store(_ctx):
        return store

    monkeypatch.setattr(module, "resolve_project_scope", resolve_project_scope)
    monkeypatch.setattr(module, "make_sqlite_store_for_context", make_store)


def _patch_celery_episode_asset_planner(
    monkeypatch: pytest.MonkeyPatch,
    module,
):
    ctx = SimpleNamespace(project_id="proj_123")
    calls: list[dict] = []

    async def resolve_project_scope(project: str, user: dict, required_role: str = "viewer"):
        return SimpleNamespace(
            ctx=ctx,
            username="admin",
            project_name="demo",
            project_dir=Path("/tmp/demo"),
            output_dir="/tmp/demo/output",
            state_dir="/tmp/demo/state",
            runtime_dir="/tmp/demo/runtime",
        )

    async def enqueue_project_task(ctx_arg, **kwargs):
        calls.append({"ctx": ctx_arg, **kwargs})
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id="task-123"),
            backend="celery",
            queue="node.node_a.default",
        )

    monkeypatch.setattr(module, "resolve_project_scope", resolve_project_scope)
    import ai_anime.shared.ports as runtime_ports

    monkeypatch.setattr(
        runtime_ports,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=enqueue_project_task),
    )
    return calls


@pytest.mark.asyncio
async def test_get_episode_detail_returns_nicegui_fields(tmp_path, monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    episode = NovelEpisode(
        number=1,
        title="第一集",
        raw_content="原文",
        beat_source_text="分镜源文本",
        content_summary="摘要",
        character_names=["秦"],
        key_events=["入宫"],
        cliffhanger="悬念",
        identity_ids=["秦_幼年"],
        identity_default_map={"秦": "秦_幼年"},
        scene_menu=[{"scene_id": "宫门", "scene_name": "宫门"}],
        prop_menu=[{"prop_id": "玉佩", "prop_name": "玉佩"}],
    )
    _patch_project_and_store(
        monkeypatch,
        episodes,
        tmp_path,
        _EpisodeStore(episode),
    )

    response = await episodes.get_episode_detail(
        project="demo",
        episode_num=1,
        user={"username": "admin"},
    )

    assert response["ok"] is True
    assert response["data"] == {
        "number": 1,
        "title": "第一集",
        "summary": "摘要",
        "raw_content": "原文",
        "beat_source_text": "分镜源文本",
        "content_summary": "摘要",
        "character_names": ["秦"],
        "key_events": ["入宫"],
        "cliffhanger": "悬念",
        "identity_ids": ["秦_幼年"],
        "identity_default_map": {"秦": "秦_幼年"},
        "scene_menu": [
            {
                "scene_id": "宫门",
                "base_scene_id": "",
                "variant_id": "",
                "time_of_day": "",
            }
        ],
        "prop_menu": [
            {
                "prop_id": "玉佩",
                "prop_type": "object",
                "visual_prompt": "",
                "description": "",
                "owner_identity_id": "",
                "marker_color": "",
            }
        ],
    }


@pytest.mark.asyncio
async def test_list_episodes_returns_fields_needed_by_react_workbench(tmp_path, monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    episode = NovelEpisode(
        number=1,
        title="第一集",
        content_summary="摘要",
        identity_ids=["秦_幼年", "赵_青年"],
        key_events=["入宫", "交锋"],
        scene_menu=[{"scene_id": "宫门"}],
        prop_menu=[{"prop_id": "玉佩", "prop_type": "object"}],
    )
    _patch_project_and_store(
        monkeypatch,
        episodes,
        tmp_path,
        _EpisodeStore(episode),
    )

    response = await episodes.list_episodes(
        project="demo",
        user={"username": "admin"},
    )

    assert response["ok"] is True
    assert response["data"] == [
        {
            "number": 1,
            "title": "第一集",
            "summary": "摘要",
            "identity_ids": ["秦_幼年", "赵_青年"],
            "key_events": ["入宫", "交锋"],
            "scene_menu": [
                {
                    "scene_id": "宫门",
                    "base_scene_id": "",
                    "variant_id": "",
                    "time_of_day": "",
                }
            ],
            "prop_menu": [
                {
                    "prop_id": "玉佩",
                    "prop_type": "object",
                    "visual_prompt": "",
                    "description": "",
                    "owner_identity_id": "",
                    "marker_color": "",
                }
            ],
        }
    ]


@pytest.mark.asyncio
async def test_patch_episode_source_fields_persists_and_returns_detail(tmp_path, monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    episode = NovelEpisode(number=1, title="第一集")
    store = _EpisodeStore(episode)
    _patch_project_and_store(monkeypatch, episodes, tmp_path, store)

    response = await episodes.update_episode(
        project="demo",
        episode_num=1,
        body=EpisodeUpdate(
            beat_source_text="新分镜源文本",
            identity_default_map={"秦": "秦_青年"},
        ),
        user={"username": "admin"},
    )

    assert response["ok"] is True
    assert response["data"]["beat_source_text"] == "新分镜源文本"
    assert response["data"]["identity_default_map"] == {"秦": "秦_青年"}
    assert store.updates == [
        (
            1,
            {
                "beat_source_text": "新分镜源文本",
                "identity_default_map": {"秦": "秦_青年"},
            },
        )
    ]


@pytest.mark.asyncio
async def test_patch_episode_maps_public_summary_to_storage_field(tmp_path, monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    episode = NovelEpisode(number=1, title="第一集")
    store = _EpisodeStore(episode)
    _patch_project_and_store(monkeypatch, episodes, tmp_path, store)

    response = await episodes.update_episode(
        project="demo",
        episode_num=1,
        body=EpisodeUpdate(summary="新摘要"),
        user={"username": "admin"},
    )

    assert response["ok"] is True
    assert response["data"]["summary"] == "新摘要"
    assert store.updates == [(1, {"content_summary": "新摘要"})]


@pytest.mark.asyncio
async def test_plan_episode_identities_enqueues_celery_task(monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    ctx = SimpleNamespace(project_id="proj_123")
    calls: list[dict] = []

    async def resolve_project_scope(project: str, user: dict, required_role: str = "viewer"):
        return SimpleNamespace(
            ctx=ctx,
            username="admin",
            project_name="demo",
            project_dir=Path("/tmp/demo"),
            output_dir="/tmp/demo/output",
            state_dir="/tmp/demo/state",
            runtime_dir="/tmp/demo/runtime",
        )

    async def enqueue_project_task(ctx_arg, **kwargs):
        calls.append({"ctx": ctx_arg, **kwargs})
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id="task-identity"),
            backend="celery",
            queue="node.node_a.default",
        )

    monkeypatch.setattr(episodes, "resolve_project_scope", resolve_project_scope)
    import ai_anime.shared.ports as runtime_ports

    monkeypatch.setattr(
        runtime_ports,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=enqueue_project_task),
    )
    response = await episodes.plan_episode_identities(
        project="proj_123",
        episode_num=1,
        user={"username": "admin"},
    )

    assert response["ok"] is True
    assert response["task_type"] == "identity_planner"
    assert response["task_id"] == "task-identity"
    assert response["task_key"] == "task:identity_planner:project:proj_123:1"
    assert response["backend"] == "celery"
    assert response["queue"] == "node.node_a.default"
    assert response["data"] == {"target_episode": 1}
    assert calls == [
        {
            "ctx": ctx,
            "task_type": "identity_planner",
            "queue_kind": "default",
            "episode": 1,
            "payload": {"episode": 1},
        }
    ]


@pytest.mark.asyncio
async def test_plan_episode_scenes_enqueues_celery_task(monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    calls = _patch_celery_episode_asset_planner(monkeypatch, episodes)

    response = await episodes.plan_episode_scenes(
        project="proj_123",
        episode_num=4,
        user={"username": "admin"},
    )

    assert response == {
        "ok": True,
        "task_type": "episode_scene_planner",
        "scope": "scene_run_ep004",
        "task_id": "task-123",
        "task_key": "task:episode_scene_planner:project:proj_123:4:scene_run_ep004",
        "backend": "celery",
        "queue": "node.node_a.default",
        "data": {"target_episode": 4, "asset_kind": "scene"},
        "message": "第 4 集场景规划已进入队列",
    }
    assert calls == [
        {
            "ctx": calls[0]["ctx"],
            "task_type": "episode_scene_planner",
            "queue_kind": "default",
            "episode": 4,
            "scope": "scene_run_ep004",
            "payload": {"episode": 4, "asset_kind": "scene"},
        }
    ]


@pytest.mark.asyncio
async def test_plan_episode_props_enqueues_celery_task(monkeypatch):
    from ai_anime.api.routes.narrative_planning import episodes

    calls = _patch_celery_episode_asset_planner(monkeypatch, episodes)

    response = await episodes.plan_episode_props(
        project="proj_123",
        episode_num=4,
        user={"username": "admin"},
    )

    assert response == {
        "ok": True,
        "task_type": "episode_prop_planner",
        "scope": "prop_run_ep004",
        "task_id": "task-123",
        "task_key": "task:episode_prop_planner:project:proj_123:4:prop_run_ep004",
        "backend": "celery",
        "queue": "node.node_a.default",
        "data": {"target_episode": 4, "asset_kind": "prop"},
        "message": "第 4 集道具规划已进入队列",
    }
    assert calls == [
        {
            "ctx": calls[0]["ctx"],
            "task_type": "episode_prop_planner",
            "queue_kind": "default",
            "episode": 4,
            "scope": "prop_run_ep004",
            "payload": {"episode": 4, "asset_kind": "prop"},
        }
    ]

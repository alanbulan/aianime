from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from ai_anime.modules.project_workspace.public import ProjectContext


pytestmark = pytest.mark.m09


@dataclass
class DummySqliteStore:
    beats: list[dict]
    updates: list[dict] = field(default_factory=list)
    characters: list[dict] = field(default_factory=list)
    sketch_colors: dict[str, str] = field(default_factory=dict)
    scheduled_beat_prompts: list[object] = field(default_factory=list)
    scheduled_video_prompt_optimization: list[object] = field(default_factory=list)

    async def get_script_as_dict(self, episode: int):
        return {"episode": episode, "beats": [dict(beat) for beat in self.beats]}

    def get_all_characters(self):
        return list(self.characters)

    def get_sketch_colors(self, episode_num: int):
        return dict(self.sketch_colors)

    async def update_beat_asset(self, episode_number: int, beat_number: int, **updates):
        self.updates.append(
            {"episode": episode_number, "beat": beat_number, "updates": updates}
        )
        for beat in self.beats:
            if int(beat.get("beat_number") or 0) == beat_number:
                beat.update(updates)
                return True
        return False


class DummyCogneeStore:
    pass


def _client(
    monkeypatch,
    tmp_path,
    beats: list[dict],
    *,
    ctx=None,
):
    from ai_anime.api.routes.narrative_planning import scripts
    from ai_anime.api.deps import ProjectResolution

    sqlite_store = DummySqliteStore(beats)
    resolved_ctx = ctx or _project_ctx(tmp_path)

    async def _make_sqlite_store(username: str, project: str):
        return sqlite_store

    async def _make_cognee_store(username: str, project: str):
        return DummyCogneeStore()

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        return ProjectResolution(
            ctx=resolved_ctx,
            username="admin",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    monkeypatch.setattr(scripts, "resolve_project_scope", fake_resolve_project_scope)
    monkeypatch.setattr(scripts, "make_sqlite_store", _make_sqlite_store)
    monkeypatch.setattr(
        scripts,
        "make_sqlite_store_for_context",
        lambda _ctx: _make_sqlite_store("admin", "demo"),
    )
    monkeypatch.setattr(scripts, "make_cognee_store", _make_cognee_store)

    async def fake_enqueue_beat_video_prompt_generation(
        _ctx,
        *,
        episode_num,
        beat_num,
        field,
        language,
        output_dir,
    ):
        sqlite_store.scheduled_beat_prompts.append(
            SimpleNamespace(
                episode=episode_num,
                beat_num=beat_num,
                field=field,
                language=language,
                output_dir=output_dir,
            )
        )
        return SimpleNamespace(
            as_dict=lambda: {
                "task_type": "beat_video_prompt",
                "task_id": "task-beat-prompt-1",
                "task_key": "task:beat_video_prompt:demo:1:1",
                "backend": "local",
                "queue": None,
                "message": "第 1 集 Beat 1 提示词生成已入队",
            }
        )

    async def fake_enqueue_video_prompt_optimization(_ctx, command):
        sqlite_store.scheduled_video_prompt_optimization.append(command)
        return SimpleNamespace(
            as_dict=lambda: {
                "task_type": "video_prompt_optimization",
                    "task_id": "task-video-prompt-1",
                "task_key": "task:video_prompt:demo:1:1",
                "backend": "local",
                "queue": None,
                "message": "第 1 集 Beat 1 视频提示词优化已入队",
            }
        )

    monkeypatch.setattr(
        scripts,
        "enqueue_beat_video_prompt_generation",
        fake_enqueue_beat_video_prompt_generation,
    )
    monkeypatch.setattr(
        scripts,
        "enqueue_video_prompt_optimization",
        fake_enqueue_video_prompt_optimization,
    )
    app = FastAPI()
    app.include_router(scripts.router)
    app.dependency_overrides[scripts.get_api_user] = lambda: {"username": "admin"}
    return TestClient(app), sqlite_store


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


def test_generate_video_prompt_submits_task_without_updating_config(
    monkeypatch, tmp_path
):
    client, store = _client(
        monkeypatch,
        tmp_path,
        [
            {
                "beat_number": 1,
                "video_config_json": json.dumps(
                    {
                        "mode": "first_frame",
                        "duration": 5,
                        "resolution": "720p",
                        "ratio": "9:16",
                        "final_prompt": "current video prompt",
                    }
                ),
            },
            {"beat_number": 2},
        ],
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/optimize",
        json={
            "manual_prompt_reference": "current video prompt",
            "prompt_guidance": "more camera motion",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["task_type"] == "video_prompt_optimization"
    assert payload["task_id"] == "task-video-prompt-1"
    assert store.updates == []
    command = store.scheduled_video_prompt_optimization[0]
    assert command.project_dir == tmp_path
    assert command.manual_prompt_reference == "current video prompt"
    assert command.prompt_guidance == "more camera motion"


@pytest.mark.asyncio
async def test_video_prompt_worker_rejects_non_ai_result(tmp_path):
    from ai_anime.modules.narrative_planning.application.video_prompt_optimization import (
        GenerateVideoPrompt,
        GenerateVideoPromptCommand,
        VideoPromptRejected,
    )

    class _FallbackGateway:
        def mode(self, _config_json):
            return "first_frame"

        async def generate(self, **_kwargs):
            return json.dumps(
                {
                    "final_prompt": "规则草稿",
                    "prompt_source": "fallback",
                }
            )

        def result_fields(self, config_json):
            config = json.loads(config_json)
            return config["final_prompt"], config["prompt_source"]

    service = GenerateVideoPrompt(gateway=_FallbackGateway())
    store = DummySqliteStore([{"beat_number": 1}])

    with pytest.raises(VideoPromptRejected, match="模型未返回可用结果"):
        await service.execute(
            store,
            GenerateVideoPromptCommand(
                episode_num=1,
                beat_num=1,
                project_dir=tmp_path,
                requester_user_id="user_editor",
                project_id="proj_123",
            ),
        )
def test_generate_video_prompt_projects_queue_rejection(
    monkeypatch,
    tmp_path,
):

    from ai_anime.api.routes.narrative_planning import scripts
    from ai_anime.modules.narrative_planning.public import VideoPromptRejected

    client, _store = _client(
        monkeypatch,
        tmp_path,
        [
            {
                "beat_number": 1,
                "video_config_json": json.dumps(
                    {
                        "mode": "first_frame",
                        "duration": 5,
                        "resolution": "720p",
                        "ratio": "9:16",
                    }
                ),
            }
        ],
        ctx=_project_ctx(tmp_path),
    )

    async def reject_queue(*_args, **_kwargs):
        raise VideoPromptRejected("video prompt invalid")

    monkeypatch.setattr(
        scripts,
        "enqueue_video_prompt_optimization",
        reject_queue,
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/optimize",
        json={"prompt_guidance": "more camera motion"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "video prompt invalid"}


def test_generate_video_prompt_defers_mode_validation_to_worker(
    monkeypatch, tmp_path
):
    client, store = _client(
        monkeypatch,
        tmp_path,
        [
            {
                "beat_number": 1,
                "video_config_json": json.dumps(
                    {
                        "mode": "first_last_frame",
                        "final_prompt": "current video prompt",
                    }
                ),
            }
        ],
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/optimize",
        json={"manual_prompt_reference": "current video prompt"},
    )

    assert response.status_code == 200
    assert response.json()["task_type"] == "video_prompt_optimization"
    assert store.updates == []


def test_generate_beat_video_prompt_queues_first_frame_prompt(
    monkeypatch, tmp_path
):
    from ai_anime.modules.narrative_planning.infrastructure import (
        beat_prompt_generators,
    )

    seen = {}

    async def _generate_single_beat_video_prompt(**kwargs):
        seen.update(kwargs)
        return "generated first frame motion prompt"

    monkeypatch.setattr(
        beat_prompt_generators,
        "generate_single_beat_video_prompt",
        _generate_single_beat_video_prompt,
    )
    client, store = _client(
        monkeypatch,
        tmp_path,
        [
            {
                "beat_number": 1,
                "video_mode": "first_frame",
                "video_prompt": "old prompt",
            },
            {"beat_number": 2},
        ],
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/generate",
        json={"language": "en"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["task_type"] == "beat_video_prompt"
    assert seen == {}
    assert store.scheduled_beat_prompts[0].field == "video_prompt"
    assert store.scheduled_beat_prompts[0].language == "en"
    assert store.updates == []


def test_generate_beat_video_prompt_enqueues_project_task_in_celery_mode(
    monkeypatch, tmp_path
):
    from types import SimpleNamespace

    from ai_anime.shared import ports
    from ai_anime.api.deps import ProjectResolution
    from ai_anime.api.routes.narrative_planning import scripts

    ctx = _project_ctx(tmp_path)
    store = DummySqliteStore(
        [
            {
                "beat_number": 1,
                "video_mode": "first_frame",
                "video_prompt": "old prompt",
            },
            {"beat_number": 2},
        ]
    )
    enqueued = {}

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        return ProjectResolution(
            ctx=ctx,
            username="admin",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    async def fake_make_sqlite_store_for_context(ctx_arg):
        assert ctx_arg is ctx
        return store

    async def fake_enqueue_project_task(ctx_arg, **kwargs):
        enqueued.update({"ctx": ctx_arg, **kwargs})
        return SimpleNamespace(
            task_state=SimpleNamespace(task_id="task_prompt_1"),
            backend="celery",
            queue="queue:default",
        )

    monkeypatch.setattr(scripts, "resolve_project_scope", fake_resolve_project_scope)
    monkeypatch.setattr(
        scripts,
        "make_sqlite_store_for_context",
        fake_make_sqlite_store_for_context,
    )
    monkeypatch.setattr(
        ports,
        "get_task_backend",
        lambda: SimpleNamespace(enqueue_project_task=fake_enqueue_project_task),
    )

    app = FastAPI()
    app.include_router(scripts.router)
    app.dependency_overrides[scripts.get_api_user] = lambda: {"username": "admin"}
    client = TestClient(app)

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/generate",
        json={"language": "en"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["task_type"] == "beat_video_prompt"
    assert payload["task_id"] == "task_prompt_1"
    assert payload["task_key"].startswith("task:beat_video_prompt:project:proj_123:")
    assert enqueued["ctx"] is ctx
    assert enqueued["task_type"] == "beat_video_prompt"
    assert enqueued["queue_kind"] == "default"
    assert enqueued["episode"] == 1
    assert enqueued["beat_num"] == 1
    assert enqueued["payload"] == {
        "episode": 1,
        "beat_num": 1,
        "field": "video_prompt",
        "language": "en",
        "output_dir": str(tmp_path),
        "display_name": "生成提示词 · EP1 / Beat 1",
    }
    assert store.updates == []


@pytest.mark.asyncio
async def test_generate_beat_video_prompt_does_not_save_fallback_on_agent_failure(
    monkeypatch, tmp_path
):
    from ai_anime.modules.narrative_planning.public import (
        generate_and_save_beat_video_prompt,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    sketch_path = PathResolver(str(tmp_path), 1).sketch(1)
    sketch_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color=(20, 20, 20)).save(sketch_path)

    captured = {}

    class FakeOptimizer:
        async def optimize_single_beat(self, **kwargs):
            captured.update(kwargs)
            raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_global_video_optimizer",
        lambda: FakeOptimizer(),
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.build_color_appearance_map",
        lambda *args, **kwargs: {"#00ff00 GREEN": {"appearance": "黑衣男子"}},
    )

    store = DummySqliteStore(
        [
            {
                "beat_number": 1,
                "video_mode": "first_frame",
                "video_prompt": "old prompt",
                "visual_description": "一个人推开门向前走",
            }
        ]
    )

    with pytest.raises(RuntimeError, match="model unavailable"):
        await generate_and_save_beat_video_prompt(
            store,
            output_dir=tmp_path,
            episode_num=1,
            beat_num=1,
            language="en",
        )

    assert captured["character_color_map"] == {"#00ff00 GREEN": {"appearance": "黑衣男子"}}
    assert store.beats[0]["video_prompt"] == "old prompt"
    assert store.updates == []


@pytest.mark.asyncio
async def test_generate_beat_video_prompt_uses_superpower_single_beat_optimizer(
    monkeypatch, tmp_path
):
    from ai_anime.modules.narrative_planning.public import (
        generate_and_save_beat_video_prompt,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    sketch_path = PathResolver(str(tmp_path), 1).sketch(1)
    sketch_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color=(0, 255, 0)).save(sketch_path)

    map_seen = {}
    optimizer_seen = {}

    def fake_build_color_appearance_map(beats, characters, output_dir, project, **kwargs):
        map_seen.update(
            {
                "beats": beats,
                "characters": characters,
                "output_dir": output_dir,
                "project": project,
                **kwargs,
            }
        )
        return {"#00ff00 GREEN": {"appearance": "黑衣男子"}}

    class FakeOptimizer:
        async def optimize_single_beat(self, **kwargs):
            optimizer_seen.update(kwargs)
            return {"beat_number": 1, "video_mode": "first_frame", "prompt": "superpower prompt"}

    monkeypatch.setattr(
        "ai_anime.modules.production.public.build_color_appearance_map",
        fake_build_color_appearance_map,
    )
    monkeypatch.setattr(
        "ai_anime.modules.production.public.get_global_video_optimizer",
        lambda: FakeOptimizer(),
    )
    store = DummySqliteStore(
        [
            {
                "beat_number": 1,
                "video_mode": "first_frame",
                "video_prompt": "old prompt",
                "visual_description": "{{男主_青年}}推开墙砖",
            },
            {"beat_number": 2, "visual_description": "下一个镜头"},
        ],
        characters=[
            {
                "name": "男主",
                "identities": [
                    {
                        "identity_id": "男主_青年",
                        "appearance_details": "黑衣",
                    }
                ],
            }
        ],
        sketch_colors={"男主_青年": "#00ff00 GREEN"},
    )

    result = await generate_and_save_beat_video_prompt(
        store,
        output_dir=tmp_path,
        project_name="demo",
        episode_num=1,
        beat_num=1,
        language="en",
    )

    assert result.prompt == "superpower prompt"
    assert optimizer_seen["sketch_image_path"] == str(sketch_path)
    assert optimizer_seen["character_color_map"] == {
        "#00ff00 GREEN": {"appearance": "黑衣男子"}
    }
    assert optimizer_seen["next_beat"]["beat_number"] == 2
    assert map_seen["project"] == "demo"
    assert map_seen["cognee_store"] is store
    assert store.updates == [
        {
            "episode": 1,
            "beat": 1,
            "updates": {"video_prompt": "superpower prompt"},
        }
    ]


def test_generate_beat_video_prompt_queues_keyframe_prompt(monkeypatch, tmp_path):
    from ai_anime.modules.narrative_planning.infrastructure import (
        beat_prompt_generators,
    )

    seen = {}

    async def _generate_single_beat_keyframe_prompt(**kwargs):
        seen.update(kwargs)
        return "generated first last frame prompt"

    monkeypatch.setattr(
        beat_prompt_generators,
        "generate_single_beat_keyframe_prompt",
        _generate_single_beat_keyframe_prompt,
    )
    client, store = _client(
        monkeypatch,
        tmp_path,
        [
            {
                "beat_number": 1,
                "video_mode": "keyframe",
                "keyframe_prompt": "old keyframe prompt",
            },
            {"beat_number": 2},
        ],
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/generate",
        json={},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["task_type"] == "beat_video_prompt"
    assert seen == {}
    assert store.scheduled_beat_prompts[0].field == "keyframe_prompt"
    assert store.updates == []


def test_generate_beat_video_prompt_requires_next_beat_for_keyframe(
    monkeypatch, tmp_path
):
    client, store = _client(
        monkeypatch,
        tmp_path,
        [{"beat_number": 1, "video_mode": "keyframe"}],
    )

    response = client.post(
        "/projects/demo/episodes/1/beats/1/video-prompt/generate",
        json={},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": False,
        "error": "这是最后一个 Beat，无法生成首尾帧过渡提示词",
    }
    assert store.updates == []

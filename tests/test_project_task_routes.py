from pathlib import Path

import pytest

from ai_anime.api.routes.task_execution import tasks as tasks_route
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.task_state import TaskStateManager
from ai_anime.modules.task_execution.infrastructure.admission_policy import (
    global_lane_concurrency,
    project_user_lane_active_limit,
)

pytestmark = pytest.mark.m07


def test_default_user_task_limit_matches_local_executor(monkeypatch) -> None:
    monkeypatch.delenv("AI_ANIME_PROJECT_USER_MAX_ACTIVE_DEFAULT_TASKS", raising=False)
    monkeypatch.delenv("AI_ANIME_CE_GLOBAL_MAX_ACTIVE_DEFAULT_TASKS", raising=False)

    assert project_user_lane_active_limit("default") == 8
    assert project_user_lane_active_limit("default") == global_lane_concurrency("default")


def test_workflow_lane_serializes_each_project_without_using_default_slots(
    monkeypatch,
) -> None:
    monkeypatch.delenv("AI_ANIME_PROJECT_USER_MAX_ACTIVE_WORKFLOW_TASKS", raising=False)
    monkeypatch.delenv("AI_ANIME_CE_GLOBAL_MAX_ACTIVE_WORKFLOW_TASKS", raising=False)

    assert project_user_lane_active_limit("workflow") == 1
    assert global_lane_concurrency("workflow") == 4


def _ctx(
    tmp_path: Path,
    *,
    role: str = "editor",
    requester_user_id: str = "user_editor",
    requester_username: str = "bob",
) -> ProjectContext:
    return ProjectContext(
        project_id="proj_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id=requester_user_id,
        requester_username=requester_username,
        requester_principals=(("user", requester_user_id),),
        effective_role=role,
        home_node_id="node_a",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_legacy_global_task_routes_are_not_registered():
    import httpx
    from fastapi import FastAPI

    from ai_anime.api.routes.task_execution.tasks import router

    app = FastAPI()
    app.include_router(router)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.get("/tasks")).status_code == 404
        assert (await client.get("/tasks/stream")).status_code == 404
        assert (await client.delete("/tasks/completed")).status_code == 404
        assert (await client.get("/tasks/single_video/proj_123/1")).status_code == 404
        assert (await client.get("/tasks/single_video/proj_123/1/stream")).status_code == 404
        assert (await client.delete("/tasks/single_video/proj_123/1")).status_code == 404


@pytest.mark.asyncio
async def test_project_task_list_reads_only_resolved_project(tmp_path, monkeypatch):
    ctx = _ctx(tmp_path, role="viewer")
    other = _ctx(tmp_path / "other", role="viewer")
    object.__setattr__(other, "project_id", "proj_other")

    manager = TaskStateManager()
    manager.create_task_for_project(ctx, "single_video", 1, beat_num=15)
    manager.create_task_for_project(other, "single_video", 1, beat_num=99)

    async def fake_resolve_project_context(**kwargs):
        assert kwargs["project_id"] == "proj_123"
        assert kwargs["required_role"] == "viewer"
        return ctx

    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr("ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager", lambda: manager)

    response = await tasks_route.list_project_tasks("proj_123", user={"username": "bob"})

    assert response["ok"] is True
    assert [task["project_id"] for task in response["data"]] == ["proj_123"]
    assert response["data"][0]["task_key"].startswith("task:single_video:project:proj_123:")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ({}, {"video_running", "video_completed", "video_other_episode", "compose_running", "identity_completed"}),
        ({"episode": 0}, {"identity_completed"}),
        ({"episode": 1}, {"video_running", "video_completed", "compose_running"}),
        ({"task_type": " single_video "}, {"video_running", "video_completed", "video_other_episode"}),
        ({"status": " RUNNING "}, {"video_running", "video_other_episode", "compose_running"}),
        ({"status": "completed"}, {"video_completed", "identity_completed"}),
        ({"episode": 1, "task_type": "single_video", "status": "running"}, {"video_running"}),
        ({"episode": 1, "task_type": "identity_image"}, set()),
        ({"status": "unknown"}, set()),
    ],
)
async def test_project_task_list_filters_over_http(tmp_path, monkeypatch, query, expected):
    import httpx
    from fastapi import FastAPI

    ctx = _ctx(tmp_path, role="viewer")
    manager = TaskStateManager()
    task_ids = {}
    for scope, task_type, episode, status in [
        ("video_running", "single_video", 1, "running"),
        ("video_completed", "single_video", 1, "completed"),
        ("video_other_episode", "single_video", 2, "running"),
        ("compose_running", "compose_episode", 1, "running"),
        ("identity_completed", "identity_image", 0, "running"),
    ]:
        task = manager.create_task_for_project(
            ctx, task_type, episode, scope=scope, status=status
        )
        task_ids[scope] = task.task_id
    manager.update_progress_for_project(
        ctx, "identity_image", 0, scope="identity_completed",
        progress=1.0, current_task="完成",
    )
    other = _ctx(tmp_path / "other", role="viewer")
    object.__setattr__(other, "project_id", "proj_other")
    manager.create_task_for_project(other, "single_video", 1, status="running")

    async def fake_resolve_project_context(**kwargs):
        assert kwargs["project_id"] == ctx.project_id
        assert kwargs["required_role"] == "viewer"
        return ctx

    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr(
        "ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager",
        lambda: manager,
    )
    app = FastAPI()
    app.include_router(tasks_route.router, prefix="/api/v1")
    app.dependency_overrides[tasks_route.get_api_user] = lambda: {"username": "bob"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/projects/proj_123/tasks", params=query)

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert {task["task_id"] for task in payload["data"]} == {
        task_ids[name] for name in expected
    }
    assert all(task["project_id"] == ctx.project_id for task in payload["data"])
    if query.get("status", "").strip().lower() == "completed":
        assert all(task["status"] == "completed" for task in payload["data"])


@pytest.mark.asyncio
async def test_project_task_status_uses_exact_creation_key(tmp_path, monkeypatch):
    ctx = _ctx(tmp_path, role="viewer")
    manager = TaskStateManager()
    manager.create_task_for_project(
        ctx,
        "identity_image",
        0,
        scope="character:林晚晴:identity:学生时期",
    )

    async def fake_resolve_project_context(**kwargs):
        return ctx

    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr(
        "ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager",
        lambda: manager,
    )
    task_key = (
        "task:identity_image:project:proj_123:0:"
        "character:林晚晴:identity:学生时期"
    )

    response = await tasks_route.get_project_task_by_key(
        "proj_123",
        task_key=task_key,
        user={"username": "bob"},
    )

    assert response["ok"] is True
    assert response["data"]["task_key"] == task_key
    assert response["data"]["episode"] == 0


@pytest.mark.asyncio
async def test_project_task_limits_reports_project_and_user_lane_capacity(
    tmp_path,
    monkeypatch,
):
    ctx = _ctx(tmp_path, role="viewer", requester_user_id="user_editor", requester_username="bob")
    other_user_ctx = _ctx(
        tmp_path,
        role="editor",
        requester_user_id="user_other",
        requester_username="cindy",
    )
    manager = TaskStateManager()
    manager.create_task_for_project(ctx, "freezone_edit", 0, scope="job_1", queue_kind="default")
    manager.create_task_for_project(ctx, "freezone_edit", 0, scope="job_2", queue_kind="default")
    manager.create_task_for_project(
        other_user_ctx,
        "freezone_edit",
        0,
        scope="job_3",
        queue_kind="default",
    )
    manager.create_task_for_project(ctx, "single_video", 1, beat_num=1, queue_kind="video")
    manager.create_task_for_project(
        ctx,
        "freezone_edit",
        0,
        scope="completed_job",
        queue_kind="default",
        status="completed",
    )

    async def fake_resolve_project_context(**kwargs):
        assert kwargs["project_id"] == "proj_123"
        assert kwargs["required_role"] == "viewer"
        return ctx

    async def fake_count_project_task_eligible_users(context):
        assert context is ctx
        return 2

    monkeypatch.setenv("AI_ANIME_PROJECT_MIN_ACTIVE_DEFAULT_TASKS", "3")
    monkeypatch.setenv("AI_ANIME_PROJECT_MAX_ACTIVE_DEFAULT_TASKS", "12")
    monkeypatch.setenv("AI_ANIME_PROJECT_USER_MAX_ACTIVE_DEFAULT_TASKS", "3")
    monkeypatch.setenv("AI_ANIME_PROJECT_MIN_ACTIVE_VIDEO_TASKS", "1")
    monkeypatch.setenv("AI_ANIME_PROJECT_MAX_ACTIVE_VIDEO_TASKS", "4")
    monkeypatch.setenv("AI_ANIME_PROJECT_USER_MAX_ACTIVE_VIDEO_TASKS", "1")
    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr(
        "ai_anime.modules.project_workspace.public.count_project_task_eligible_users",
        fake_count_project_task_eligible_users,
    )
    monkeypatch.setattr("ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager", lambda: manager)

    response = await tasks_route.get_project_task_limits("proj_123", user={"username": "bob"})

    assert response["ok"] is True
    assert response["data"]["default"] == {
        "limit": 6,
        "active": 3,
        "remaining": 3,
        "user_limit": 3,
        "user_active": 2,
        "user_remaining": 1,
    }
    assert response["data"]["video"] == {
        "limit": 2,
        "active": 1,
        "remaining": 1,
        "user_limit": 1,
        "user_active": 1,
        "user_remaining": 0,
    }


def test_project_task_serialization_exposes_localized_display_name() -> None:
    from ai_anime.modules.task_execution.public import serialize_project_task
    from ai_anime.modules.task_execution.infrastructure.task_state import TaskState

    task = TaskState(
        task_id="task_scene",
        task_type="episode_scene_planner",
        project_id="proj_123",
        episode=1,
        status="completed",
    )

    payload = serialize_project_task(task)

    assert payload["display_name"] == "规划场景 · ep1"
    assert payload["task_type_label"] == "规划场景"


def test_project_task_serialization_prefers_business_display_name() -> None:
    from ai_anime.modules.task_execution.public import serialize_project_task
    from ai_anime.modules.task_execution.infrastructure.task_state import TaskState

    task = TaskState(
        task_id="task_canvas",
        task_type="freezone_edit",
        project_id="proj_123",
        episode=0,
        status="running",
        metadata={
            "display_name": "生成草图 · EP1 / Beat 3",
            "source_label": "导演合成图",
            "target_label": "当前草图",
        },
    )

    payload = serialize_project_task(task)

    assert payload["display_name"] == "生成草图 · EP1 / Beat 3"
    assert payload["task_type_label"] == "AI anime 画布编辑"
    assert payload["metadata"]["source_label"] == "导演合成图"


def test_project_task_serialization_treats_stale_full_progress_as_completed() -> None:
    from ai_anime.modules.task_execution.public import serialize_project_task
    from ai_anime.modules.task_execution.infrastructure.task_state import TaskState

    task = TaskState(
        task_id="task_3gs",
        task_type="freezone_image_to_3gs",
        project_id="proj_123",
        episode=0,
        scope="job_3gs",
        status="running",
        progress=1.0,
        current_task="完成",
    )

    payload = serialize_project_task(task)

    assert payload["status"] == "completed"
    assert payload["display_name"] == "图片转世界"


def test_project_task_serialization_normalizes_timestamp_fields_to_utc_z() -> None:
    from ai_anime.modules.task_execution.public import serialize_project_task
    from ai_anime.modules.task_execution.infrastructure.task_state import TaskState

    task = TaskState(
        task_id="task_time",
        task_type="freezone_video_gen",
        project_id="proj_123",
        episode=0,
        status="completed",
        created_at="2026-06-04T08:01:57.503089",
        updated_at="2026-06-04T08:02:57.503089+00:00",
        completed_at="2026-06-04T08:03:57.503089Z",
    )
    task.expires_at = "2026-06-04T09:03:57.503089"

    payload = serialize_project_task(task)

    assert payload["created_at"] == "2026-06-04T08:01:57.503089Z"
    assert payload["updated_at"] == "2026-06-04T08:02:57.503089Z"
    assert payload["completed_at"] == "2026-06-04T08:03:57.503089Z"
    assert payload["expires_at"] == "2026-06-04T09:03:57.503089Z"


@pytest.mark.asyncio
async def test_project_task_clear_completed_uses_editor_role(tmp_path, monkeypatch):
    ctx = _ctx(tmp_path, role="editor")
    manager = TaskStateManager()
    manager.create_task_for_project(ctx, "single_video", 1, beat_num=15)
    manager.complete_task_for_project(ctx, "single_video", 1, beat_num=15)
    manager.create_task_for_project(ctx, "single_video", 1, beat_num=16)

    async def fake_resolve_project_context(**kwargs):
        assert kwargs["project_id"] == "proj_123"
        assert kwargs["required_role"] == "editor"
        return ctx

    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr("ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager", lambda: manager)

    response = await tasks_route.clear_project_completed_tasks("proj_123", user={"username": "bob"})

    assert response == {"ok": True, "data": {"deleted": 1}}
    remaining = manager.list_tasks_for_project(ctx)
    assert len(remaining) == 1
    assert remaining[0].beat_num == 16


@pytest.mark.asyncio
async def test_project_task_clear_completed_removes_stale_full_progress(
    tmp_path,
    monkeypatch,
):
    ctx = _ctx(tmp_path, role="editor")
    manager = TaskStateManager()
    manager.create_task_for_project(ctx, "freezone_image_to_3gs", 0, scope="job_3gs")
    manager.update_progress_for_project(
        ctx,
        "freezone_image_to_3gs",
        0,
        scope="job_3gs",
        progress=1.0,
        current_task="完成",
        logs=["完成"],
    )

    async def fake_resolve_project_context(**kwargs):
        assert kwargs["project_id"] == "proj_123"
        assert kwargs["required_role"] == "editor"
        return ctx

    monkeypatch.setattr(tasks_route, "resolve_project_context", fake_resolve_project_context)
    monkeypatch.setattr("ai_anime.modules.task_execution.infrastructure.task_state.get_task_manager", lambda: manager)

    response = await tasks_route.clear_project_completed_tasks("proj_123", user={"username": "bob"})

    assert response == {"ok": True, "data": {"deleted": 1}}
    assert manager.list_tasks_for_project(ctx) == []

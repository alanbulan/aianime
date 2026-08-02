"""任务列表/状态/终止端点。"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Query, Request
from sse_starlette.sse import EventSourceResponse

from ai_anime.api.auth import (
    get_api_user,
    get_api_user_or_query,
    verify_credential_for_request,
)
from ai_anime.modules.project_workspace.public import (
    resolve_project_context,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskRef,
    effective_task_status,
    project_task_limit_use_cases,
    project_task_use_cases,
    serialize_project_task,
)

logger = logging.getLogger("ai_anime.api.tasks")

router = APIRouter()

_SSE_REVERIFY_INTERVAL_S = 30.0
_TASK_NOT_FOUND_GRACE_S = 10.0


async def _sse_token_still_valid(
    request: Request, last_check: float
) -> tuple[bool, float]:
    now = asyncio.get_event_loop().time()
    if now - last_check < _SSE_REVERIFY_INTERVAL_S:
        return True, last_check
    try:
        user = await verify_credential_for_request(request)
    except Exception:
        logger.debug("SSE credential recheck failed", exc_info=True)
        return True, last_check
    return (user is not None), now


@router.get("/projects/{project}/tasks")
async def list_project_tasks(project: str, user: dict = Depends(get_api_user)):
    """列出单个项目的任务。生产多节点路径由 OpenResty 路由到项目 home node。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    tasks = project_task_use_cases().list_for_project(ctx)
    return {
        "ok": True,
        "data": [serialize_project_task(task, context=ctx) for task in tasks],
    }


@router.get("/projects/{project}/tasks/limits")
async def get_project_task_limits(project: str, user: dict = Depends(get_api_user)):
    """查询单个项目各队列的项目池和当前用户额度。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    capacities = await project_task_limit_use_cases().limits_for_project(ctx)
    return {
        "ok": True,
        "data": {
            queue_kind: capacity.to_dict()
            for queue_kind, capacity in capacities.items()
        },
    }


@router.delete("/projects/{project}/tasks/completed")
async def clear_project_completed_tasks(
    project: str, user: dict = Depends(get_api_user)
):
    """删除单个项目的已完成任务记录。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    deleted = project_task_use_cases().clear_completed(ctx)
    return {"ok": True, "data": {"deleted": deleted}}


@router.get("/projects/{project}/tasks/{task_type}/{episode}")
async def get_project_task(
    project: str,
    task_type: str,
    episode: int,
    beat_num: int = Query(
        None, description="Beat 编号（single_video 等按 beat 区分的任务需要）"
    ),
    scope: str | None = Query(
        None, description="任务作用域（mode_key、grid_index 等）"
    ),
    user: dict = Depends(get_api_user),
):
    """查询单个项目内指定任务的状态。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    task = project_task_use_cases().get_for_project(
        ctx,
        ProjectTaskRef(
            task_type=task_type,
            episode=episode,
            beat_num=beat_num,
            scope=scope,
        ),
    )
    if not task:
        return {"ok": True, "data": None, "message": "Task not found"}
    return {"ok": True, "data": serialize_project_task(task, context=ctx)}


@router.get("/projects/{project}/tasks/stream")
async def stream_project_tasks(
    project: str,
    request: Request,
    interval: float = Query(2.0, ge=0.5, le=10.0),
    heartbeat_sec: float = Query(15.0, ge=1.0, le=60.0),
    snapshot: bool = Query(
        True,
        description=(
            "If false, skip initial task_updated burst on connect "
            "(client has already hydrated via GET project tasks)."
        ),
    ),
    user: dict = Depends(get_api_user_or_query),
):
    """项目级 SSE 任务流。OpenResty 可按 project_id 路由到 home node。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    use_cases = project_task_use_cases()

    async def event_generator():
        last: dict[str, tuple[str, float, str]] = {}
        last_heartbeat = asyncio.get_event_loop().time()
        last_auth_check = last_heartbeat

        for task in use_cases.list_for_project(ctx):
            payload = serialize_project_task(task, context=ctx)
            key = payload["task_key"]
            last[key] = (task.status, round(task.progress, 3), task.updated_at)
            if snapshot:
                yield {
                    "event": "task_updated",
                    "data": json.dumps(payload, ensure_ascii=False),
                }

        yield {
            "event": "heartbeat",
            "data": json.dumps({"ts": last_heartbeat}, ensure_ascii=False),
        }

        while True:
            tasks = use_cases.list_for_project(ctx)
            seen: set[str] = set()
            for task in tasks:
                payload = serialize_project_task(task, context=ctx)
                key = payload["task_key"]
                seen.add(key)
                fp = (
                    task.status,
                    round(task.progress, 3),
                    task.updated_at,
                )
                if last.get(key) != fp:
                    yield {
                        "event": "task_updated",
                        "data": json.dumps(payload, ensure_ascii=False),
                    }
                    last[key] = fp

            for key in list(last.keys()):
                if key not in seen:
                    yield {
                        "event": "deleted",
                        "data": json.dumps({"task_key": key}, ensure_ascii=False),
                    }
                    del last[key]

            now = asyncio.get_event_loop().time()
            if now - last_heartbeat >= heartbeat_sec:
                yield {
                    "event": "heartbeat",
                    "data": json.dumps({"ts": now}, ensure_ascii=False),
                }
                last_heartbeat = now

            still_valid, last_auth_check = await _sse_token_still_valid(
                request, last_auth_check
            )
            if not still_valid:
                yield {
                    "event": "auth_revoked",
                    "data": json.dumps({"reason": "credential revoked or expired"}),
                }
                return

            await asyncio.sleep(interval)

    return EventSourceResponse(event_generator())


@router.get("/projects/{project}/tasks/{task_type}/{episode}/stream")
async def stream_project_task(
    project: str,
    task_type: str,
    episode: int,
    request: Request,
    beat_num: int = Query(None),
    scope: str | None = Query(None),
    interval: float = Query(2.0, ge=0.5, le=10.0),
    user: dict = Depends(get_api_user_or_query),
):
    """项目级单任务 SSE 端点。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="viewer"
    )
    use_cases = project_task_use_cases()
    reference = ProjectTaskRef(
        task_type=task_type,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )

    async def event_generator():
        last_progress = -1.0
        last_task = ""
        last_auth_check = asyncio.get_event_loop().time()
        not_found_deadline = None
        while True:
            still_valid, last_auth_check = await _sse_token_still_valid(
                request, last_auth_check
            )
            if not still_valid:
                yield {
                    "event": "auth_revoked",
                    "data": json.dumps({"reason": "credential revoked or expired"}),
                }
                return

            task = use_cases.get_for_project(ctx, reference)

            if not task:
                import time

                now = time.monotonic()
                if not_found_deadline is None:
                    not_found_deadline = now + _TASK_NOT_FOUND_GRACE_S
                if now < not_found_deadline:
                    await asyncio.sleep(interval)
                    continue
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "Task not found"}, ensure_ascii=False),
                }
                return
            not_found_deadline = None

            effective_status = effective_task_status(task)
            changed = (task.progress != last_progress) or (
                task.current_task != last_task
            )
            is_terminal = effective_status in ("completed", "failed", "cancelled")

            if changed or is_terminal:
                payload = {
                    "status": effective_status,
                    "progress": round(task.progress, 3),
                    "current_task": task.current_task,
                    "logs": task.logs[-100:],
                }
                if is_terminal:
                    payload["result"] = task.result
                    payload["error"] = task.error
                    if isinstance(task.metadata, dict):
                        payload["error_code"] = task.metadata.get("error_code")

                yield {
                    "event": effective_status,
                    "data": json.dumps(payload, ensure_ascii=False),
                }
                last_progress = task.progress
                last_task = task.current_task

            if is_terminal:
                return

            await asyncio.sleep(interval)

    return EventSourceResponse(event_generator())


@router.delete("/projects/{project}/tasks/{task_type}/{episode}")
async def cancel_project_task_route(
    project: str,
    task_type: str,
    episode: int,
    beat_num: int = Query(
        None, description="Beat 编号（single_video 等按 beat 区分的任务需要）"
    ),
    scope: str | None = Query(
        None, description="任务作用域（mode_key、grid_index 等）"
    ),
    user: dict = Depends(get_api_user),
):
    """终止单个项目内指定任务。"""
    ctx = await resolve_project_context(
        user=user, project_id=project, required_role="editor"
    )
    logger.info(
        "[%s] EP%d cancel_project_task: type=%s, beat=%s, scope=%s",
        project,
        episode,
        task_type,
        beat_num,
        scope,
    )
    cancelled = await project_task_use_cases().cancel(
        ctx,
        ProjectTaskRef(
            task_type=task_type,
            episode=episode,
            beat_num=beat_num,
            scope=scope,
        ),
    )
    if not cancelled:
        logger.warning(
            "[%s] cancel_project_task: task not found (type=%s episode=%s beat=%s scope=%s)",
            project,
            task_type,
            episode,
            beat_num,
            scope,
        )
        return {"ok": False, "error": "Task not found"}
    return {"ok": True, "message": "Task cancelled"}

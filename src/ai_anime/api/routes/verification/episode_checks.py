"""Episode-wide consistency and review endpoints."""

import logging

from fastapi import APIRouter, Depends

from ai_anime.api.deps import make_sqlite_store_for_context, resolve_project_scope
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.verification.dependencies import (
    resolve_verification_project,
    safe_output_name,
)
from ai_anime.modules.model_usage.public import resolve_model_route
from ai_anime.modules.production.public import (
    SketchEditExecutionTask,
    production_image_settings_use_cases,
    sketch_edit_execution_use_cases,
)
from ai_anime.modules.verification.public import (
    ConsistencyVerifyRequest,
    ContinuityRequest,
    LabelsValidationError,
    SketchEditExecuteRequest,
    detect_similarity,
    resolve_labels_jsonl,
    save_verify_report,
    validate_labels_jsonl,
    verification_model_task_scheduler,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/projects/{project}/episodes/{episode_num}/verify/sketch-edit-execute/start"
)
async def start_sketch_edit_execute(
    project: str,
    episode_num: int,
    body: SketchEditExecuteRequest = SketchEditExecuteRequest(),
    user: dict = Depends(get_api_user),
):
    """启动 episode 级 sketch edit execute 后台任务。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    project_dir = resolved.project_dir
    selection = production_image_settings_use_cases().resolve_project_sketch_selection(
        resolved.username,
        resolved.project_name,
    )
    model_route = resolve_model_route(selection)
    if not model_route.model:
        return {"ok": False, "error": "请先选择草图图片模型"}

    try:
        labels_name = safe_output_name(body.labels_name)
        labels_path = resolve_labels_jsonl(
            project_dir, episode_num, labels_name=labels_name
        )
        validation = validate_labels_jsonl(labels_path)
    except FileNotFoundError as error:
        return {"ok": False, "error": str(error)}
    except LabelsValidationError as error:
        return {"ok": False, "error": str(error), "details": error.payload}
    except ValueError as error:
        return {"ok": False, "error": str(error)}

    task = SketchEditExecutionTask(
        episode_num=episode_num,
        project_dir=project_dir,
        labels_name=labels_path.name,
        model=model_route.model,
        model_selector=model_route.selector,
    )
    if ctx is None:
        return {
            "ok": False,
            "error": "sketch edit execute 需要 project context",
            "task_type": "sketch_edit_execute",
            "scope": task.scope,
            "labels_jsonl": labels_path.relative_to(project_dir).as_posix(),
            "labels_validation": validation,
        }

    scheduled = await sketch_edit_execution_use_cases().start(ctx, task)
    return {
        "ok": True,
        "labels_jsonl": labels_path.relative_to(project_dir).as_posix(),
        "labels_validation": validation,
        **scheduled.as_dict(),
    }


async def _schedule_episode_verification(
    *,
    project: str,
    episode_num: int,
    user: dict,
    operation: str,
    display_name: str,
    payload: dict | None = None,
) -> dict:
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    scheduled = await verification_model_task_scheduler().execute(
        resolved.ctx,
        operation=operation,
        episode=episode_num,
        payload=payload,
        display_name=display_name,
    )
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/verify/consistency")
async def verify_consistency(
    project: str,
    episode_num: int,
    body: ConsistencyVerifyRequest = ConsistencyVerifyRequest(),
    user: dict = Depends(get_api_user),
):
    """将整集角色/服装一致性检查提交到任务队列。"""
    return await _schedule_episode_verification(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="consistency",
        payload=body.model_dump(),
        display_name=f"第 {episode_num} 集一致性检查",
    )


@router.post("/projects/{project}/episodes/{episode_num}/verify/continuity")
async def verify_continuity(
    project: str,
    episode_num: int,
    body: ContinuityRequest = ContinuityRequest(),
    user: dict = Depends(get_api_user),
):
    """将整集叙事连贯性检查提交到任务队列。"""
    return await _schedule_episode_verification(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="continuity",
        payload=body.model_dump(),
        display_name=f"第 {episode_num} 集连贯性检查",
    )


@router.post("/projects/{project}/episodes/{episode_num}/verify/similarity")
async def verify_similarity(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """执行本地像素级草图相似度检测；该操作不调用远程模型。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("verify_similarity: project=%s ep=%d", project, episode_num)
    store = await make_sqlite_store_for_context(resolved.ctx)
    try:
        result = await detect_similarity(project_dir, episode_num, sqlite_store=store)
    except Exception as error:
        logger.error("verify_similarity failed: %s", error, exc_info=True)
        return {"ok": False, "error": str(error)}
    finally:
        await store.close()

    data = result.model_dump()
    report_path = save_verify_report(project_dir, episode_num, None, "similarity", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/verify/episode-overview")
async def verify_episode_overview(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """将导演视角整集审片提交到任务队列。"""
    return await _schedule_episode_verification(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="episode_overview",
        display_name=f"第 {episode_num} 集导演审片",
    )

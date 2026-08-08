"""Episode-wide consistency and review endpoints."""

import logging

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import make_sqlite_store_for_context, resolve_project_scope
from ai_anime.api.routes.verification.dependencies import (
    resolve_verification_project,
    safe_output_name,
)
from ai_anime.modules.production.public import (
    SketchEditExecutionTask,
    production_image_settings_use_cases,
    sketch_edit_execution_use_cases,
)
from ai_anime.modules.verification.public import (
    ConsistencyVerifier,
    ConsistencyVerifyRequest,
    ContinuityRequest,
    ContinuityVerifier,
    EpisodeReviewer,
    LabelsValidationError,
    SketchEditExecuteRequest,
    detect_similarity,
    format_consistency_report,
    format_episode_overview_report,
    resolve_labels_jsonl,
    save_verify_report,
    validate_labels_jsonl,
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
    model = production_image_settings_use_cases().sketch_settings(
        resolved.username,
        resolved.project_name,
    )["sketch_image_selection"]
    if not model:
        return {"ok": False, "error": "请先选择草图图片模型"}

    try:
        labels_name = safe_output_name(body.labels_name)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    try:
        labels_path = resolve_labels_jsonl(
            project_dir, episode_num, labels_name=labels_name
        )
        validation = validate_labels_jsonl(labels_path)
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except LabelsValidationError as e:
        return {
            "ok": False,
            "error": str(e),
            "details": e.payload,
        }

    task = SketchEditExecutionTask(
        episode_num=episode_num,
        project_dir=project_dir,
        labels_name=labels_path.name,
        model=model,
    )

    if ctx is not None:
        scheduled = await sketch_edit_execution_use_cases().start(
            ctx,
            task,
        )
        return {
            "ok": True,
            "labels_jsonl": labels_path.relative_to(project_dir).as_posix(),
            "labels_validation": validation,
            **scheduled.as_dict(),
        }

    return {
        "ok": False,
        "error": "sketch edit execute 需要 project context",
        "task_type": "sketch_edit_execute",
        "scope": task.scope,
        "labels_jsonl": labels_path.relative_to(project_dir).as_posix(),
        "labels_validation": validation,
    }


@router.post("/projects/{project}/episodes/{episode_num}/verify/consistency")
async def verify_consistency(
    project: str,
    episode_num: int,
    body: ConsistencyVerifyRequest = ConsistencyVerifyRequest(),
    user: dict = Depends(get_api_user),
):
    """检查整集跨 beat 的角色/服装一致性。支持 verify_type="sketch"(默认) 或 "frame"。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "verify_consistency: project=%s ep=%d type=%s",
        project,
        episode_num,
        body.verify_type,
    )

    store = await make_sqlite_store_for_context(resolved.ctx)
    verifier = ConsistencyVerifier()
    try:
        data = await verifier.verify_consistency(
            project_dir, episode_num, verify_type=body.verify_type, sqlite_store=store
        )
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        logger.error("verify_consistency failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 报告类型区分
    report_type = "frame_consistency" if body.verify_type == "frame" else "consistency"
    data["report_text"] = format_consistency_report(data, episode_num)
    report_path = save_verify_report(project_dir, episode_num, None, report_type, data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/verify/continuity")
async def verify_continuity(
    project: str,
    episode_num: int,
    body: ContinuityRequest = ContinuityRequest(),
    user: dict = Depends(get_api_user),
):
    """T6: 检查相邻 beat 之间的叙事连贯性。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "verify_continuity: project=%s ep=%d range=%s window=%d",
        project,
        episode_num,
        body.beat_range,
        body.window_size,
    )

    store = await make_sqlite_store_for_context(resolved.ctx)
    verifier = ContinuityVerifier()
    try:
        data = await verifier.verify_continuity(
            project_dir,
            episode_num,
            beat_range=body.beat_range if body.beat_range else None,
            window_size=body.window_size,
            sqlite_store=store,
        )
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        logger.error("verify_continuity failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    report_path = save_verify_report(project_dir, episode_num, None, "continuity", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/verify/similarity")
async def verify_similarity(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """T7: 像素级草图相似度检测（零 LLM 成本）。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("verify_similarity: project=%s ep=%d", project, episode_num)

    store = await make_sqlite_store_for_context(resolved.ctx)
    try:
        result = await detect_similarity(project_dir, episode_num, sqlite_store=store)
    except Exception as e:
        logger.error("verify_similarity failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

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
    """T8: 导演视角全局分镜审片 — 整集草图拼网格图，一次 LLM 调用评估整体表现。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("verify_episode_overview: project=%s ep=%d", project, episode_num)

    store = await make_sqlite_store_for_context(resolved.ctx)
    reviewer = EpisodeReviewer()
    try:
        data = await reviewer.review_episode(
            project_dir, episode_num, sqlite_store=store
        )
    except (FileNotFoundError, ValueError) as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        logger.error("verify_episode_overview failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    data["report_text"] = format_episode_overview_report(data, episode_num)
    report_path = save_verify_report(
        project_dir, episode_num, None, "episode_overview", data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}

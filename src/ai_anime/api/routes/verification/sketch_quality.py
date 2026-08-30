"""Sketch scoring, comparison, selection, and color-check endpoints."""

import logging

from fastapi import APIRouter, Depends

from ai_anime.api.deps import make_sqlite_store_for_context
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.verification.dependencies import (
    resolve_verification_project,
)
from ai_anime.modules.verification.public import (
    ColorVerifyRequest,
    CompareRequest,
    ScoreBatchRequest,
    SketchScoreRequest,
    SketchSelectRequest,
    format_color_verify_report,
    load_all_beats,
    save_verify_report,
    verification_model_task_scheduler,
    verify_episode_sketch_colors,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def _schedule(
    *,
    project: str,
    episode_num: int,
    user: dict,
    operation: str,
    display_name: str,
    payload: dict | None = None,
    beat_num: int | None = None,
) -> dict:
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    scheduled = await verification_model_task_scheduler().execute(
        resolved.ctx,
        operation=operation,
        episode=episode_num,
        beat_num=beat_num,
        payload=payload,
        display_name=display_name,
    )
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/score")
async def score_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: SketchScoreRequest = SketchScoreRequest(),
    user: dict = Depends(get_api_user),
):
    """将单个 beat 的草图内容评分提交到任务队列。"""
    return await _schedule(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="score_beat",
        beat_num=beat_num,
        payload=body.model_dump(),
        display_name=f"Beat {beat_num} 草图评分",
    )


@router.post("/projects/{project}/episodes/{episode_num}/beats/score-batch")
async def score_batch(
    project: str,
    episode_num: int,
    body: ScoreBatchRequest = ScoreBatchRequest(),
    user: dict = Depends(get_api_user),
):
    """将整集候选草图批量评分提交到任务队列。"""
    return await _schedule(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="score_batch",
        payload=body.model_dump(),
        display_name=f"第 {episode_num} 集草图批量评分",
    )


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/compare")
async def compare_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: CompareRequest,
    user: dict = Depends(get_api_user),
):
    """将候选草图对比择优提交到任务队列。"""
    return await _schedule(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="compare_beat",
        beat_num=beat_num,
        payload=body.model_dump(),
        display_name=f"Beat {beat_num} 候选草图对比",
    )


@router.post("/projects/{project}/episodes/{episode_num}/verify/sketch-select")
async def sketch_select(
    project: str,
    episode_num: int,
    body: SketchSelectRequest = SketchSelectRequest(),
    user: dict = Depends(get_api_user),
):
    """将整集草图择优编排提交到任务队列。"""
    return await _schedule(
        project=project,
        episode_num=episode_num,
        user=user,
        operation="sketch_select",
        payload=body.model_dump(),
        display_name=f"第 {episode_num} 集草图择优",
    )


@router.post("/projects/{project}/episodes/{episode_num}/verify/sketch-colors")
async def verify_sketch_colors(
    project: str,
    episode_num: int,
    body: ColorVerifyRequest = ColorVerifyRequest(),
    user: dict = Depends(get_api_user),
):
    """执行本地草图颜色交叉验证；该操作不调用远程模型。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info("verify_sketch_colors: project=%s ep=%d", project, episode_num)

    store = None
    try:
        store = await make_sqlite_store_for_context(resolved.ctx)
        beats = await load_all_beats(project_dir, episode_num, sqlite_store=store)
        sketch_colors = store.get_sketch_colors(episode_num) or {}
        if not sketch_colors:
            return {
                "ok": False,
                "error": "No sketch_colors found. Run Step 12.3 (assign-colors) first.",
            }
        result = verify_episode_sketch_colors(
            project_dir,
            episode_num,
            beats,
            sketch_colors,
            missing_threshold=body.missing_threshold,
            extra_threshold=body.extra_threshold,
        )
    except Exception as error:
        logger.error("verify_sketch_colors failed: %s", error, exc_info=True)
        return {"ok": False, "error": str(error)}
    finally:
        if store is not None:
            await store.close()

    data = result.model_dump()
    data["report_text"] = format_color_verify_report(data, episode_num)
    report_path = save_verify_report(
        project_dir, episode_num, None, "sketch_colors", data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()
    return {"ok": True, "data": data}

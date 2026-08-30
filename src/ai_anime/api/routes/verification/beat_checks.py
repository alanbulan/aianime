"""Single-beat image and frame verification endpoints."""

import logging

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.verification.dependencies import (
    resolve_verification_project,
)
from ai_anime.modules.verification.public import (
    VerifyRequest,
    verification_model_task_scheduler,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/verify")
async def verify_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: VerifyRequest,
    user: dict = Depends(get_api_user),
):
    """将单个 beat 的草图/首帧匹配验证提交到任务队列。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    logger.info(
        "queue verify_beat: project=%s ep=%d beat=%d type=%s",
        project,
        episode_num,
        beat_num,
        body.type,
    )
    scheduled = await verification_model_task_scheduler().execute(
        resolved.ctx,
        operation="beat_verify",
        episode=episode_num,
        beat_num=beat_num,
        payload={"verify_type": body.type},
        display_name=f"Beat {beat_num} {body.type} 验证",
    )
    return {"ok": True, **scheduled.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/verify-frame"
)
async def verify_frame(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """将单个 beat 的首帧渲染质量验证提交到任务队列。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    logger.info(
        "queue verify_frame: project=%s ep=%d beat=%d",
        project,
        episode_num,
        beat_num,
    )
    scheduled = await verification_model_task_scheduler().execute(
        resolved.ctx,
        operation="frame_verify",
        episode=episode_num,
        beat_num=beat_num,
        display_name=f"Beat {beat_num} 首帧验证",
    )
    return {"ok": True, **scheduled.as_dict()}

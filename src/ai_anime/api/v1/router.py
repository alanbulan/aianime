"""Version 1 router registry."""

from __future__ import annotations

import os
from importlib.metadata import entry_points

from fastapi import APIRouter

from ai_anime.api.routes import (
    ai_assistant,
    asset_world,
    creative_canvas,
    identity_access,
    model_usage,
    narrative_planning,
    platform_release,
    production,
    project_workspace,
    story_intake,
    task_execution,
    verification,
)
from ai_anime.shared import runtime_env

OPENAPI_TAGS = [
    {"name": "freezone-bootstrap", "description": "Freezone 启动、初始化与 provider 能力发现。"},
    {"name": "freezone-media", "description": "Freezone 候选媒体输入，如上传与外部文件导入。"},
    {
        "name": "freezone-audio",
        "description": "Freezone 音频节点接口，包括参考音频和文生语音。",
    },
    {
        "name": "freezone-image",
        "description": "Freezone 图片节点接口，包括生成、编辑、扩图、重绘、反推提示词等。",
    },
    {
        "name": "freezone-video",
        "description": "Freezone 视频节点接口，包括文生视频、图生视频、运镜模板、角色库等。",
    },
    {"name": "freezone-text", "description": "Freezone 文本节点接口，包括翻译与故事脚本生成。"},
    {"name": "freezone-canvas", "description": "Freezone 画布文档接口。"},
    {"name": "freezone-assets", "description": "Freezone canonical 资产与上下文接口。"},
    {
        "name": "freezone-commit",
        "description": "Freezone candidate 写回 canonical asset slot 的相关接口。",
    },
    {"name": "freezone-jobs", "description": "Freezone 异步任务结果查询接口。"},
]


def create_api_router(*, desktop_mode: bool | None = None) -> APIRouter:
    if desktop_mode is None:
        desktop_mode = os.environ.get("AI_ANIME_DESKTOP_MODE", "") == "1"

    router = APIRouter(prefix="/api/v1")
    router.include_router(identity_access.create_router(desktop_mode=desktop_mode))
    if not runtime_env.is_ce_effective():
        for entry_point in entry_points(group="ai_anime.api_routes"):
            entry_point.load()(router)
    router.include_router(platform_release.create_router())
    router.include_router(ai_assistant.create_router())
    router.include_router(project_workspace.create_router())
    router.include_router(story_intake.create_router())
    router.include_router(asset_world.create_router())
    router.include_router(narrative_planning.create_router())
    router.include_router(production.create_router())
    router.include_router(task_execution.create_router())
    router.include_router(model_usage.create_router())
    router.include_router(creative_canvas.create_router())
    router.include_router(verification.create_router(), tags=["verification"])
    return router

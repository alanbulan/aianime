"""Version 1 router registry."""

from __future__ import annotations

import os
from importlib.metadata import entry_points

from fastapi import APIRouter

from ai_anime.api.routes import (
    assets,
    asset_world_viewer,
    auth,
    characters,
    chat,
    config,
    content,
    episodes,
    files,
    freezone,
    ingest,
    model_credits,
    model_gateway,
    pipeline,
    production_audio,
    production_export,
    production_pool,
    production_render,
    production_settings,
    production_sketch,
    production_video,
    projects,
    props,
    release_notifications,
    scenes,
    scripts,
    styles,
    tasks,
)
from ai_anime.api.routes.canvas import bootstrap as freezone_bootstrap
from ai_anime.api.routes.canvas import audio as freezone_audio
from ai_anime.api.routes.canvas import image as freezone_image
from ai_anime.api.routes.canvas import media as freezone_media
from ai_anime.api.routes.canvas import text as freezone_text
from ai_anime.api.routes.canvas import video as freezone_video
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
    router.include_router(auth.router, tags=["auth"])
    if desktop_mode:
        router.include_router(auth.desktop_router, tags=["auth"])
    if not runtime_env.is_ce_effective():
        for entry_point in entry_points(group="ai_anime.api_routes"):
            entry_point.load()(router)
    router.include_router(config.router, tags=["config"])
    router.include_router(chat.router, tags=["chat"])
    router.include_router(projects.router, tags=["projects"])
    router.include_router(ingest.router, tags=["ingest"])
    router.include_router(characters.router, tags=["characters"])
    router.include_router(assets.router, tags=["assets"])
    router.include_router(scenes.router, tags=["scenes"])
    router.include_router(props.router, tags=["props"])
    router.include_router(episodes.router, tags=["episodes"])
    router.include_router(scripts.router, tags=["scripts"])
    router.include_router(content.router, tags=["content"])
    router.include_router(asset_world_viewer.router, tags=["generation"])
    router.include_router(production_audio.router, tags=["generation"])
    router.include_router(production_export.router, tags=["generation"])
    router.include_router(production_pool.router, tags=["generation"])
    router.include_router(production_render.router, tags=["generation"])
    router.include_router(production_settings.router, tags=["generation"])
    router.include_router(production_sketch.router, tags=["generation"])
    router.include_router(production_video.router, tags=["generation"])
    router.include_router(tasks.router, tags=["tasks"])
    router.include_router(files.router, tags=["files"])
    router.include_router(styles.router, tags=["styles"])
    router.include_router(pipeline.router, tags=["pipeline"])
    router.include_router(model_gateway.router, tags=["model-gateway"])
    router.include_router(model_credits.router, tags=["model-credits"])
    router.include_router(
        release_notifications.router,
        tags=["release-notifications"],
    )
    router.include_router(freezone_bootstrap.router)
    router.include_router(freezone_audio.router)
    router.include_router(freezone_image.router)
    router.include_router(freezone_media.router)
    router.include_router(freezone_text.router)
    router.include_router(freezone_video.router)
    router.include_router(freezone.router)

    from ai_anime.verification.routes import router as verification_router

    router.include_router(verification_router, tags=["verification"])
    return router

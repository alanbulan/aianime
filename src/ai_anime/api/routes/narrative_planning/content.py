"""原文、改写稿与解说 adapter 端点。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.routes.identity_access.dependencies import (
    get_api_user,
    require_project_scope,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.narrative_planning.content_schemas import (
    ContentUpdateRequest,
    RewriteGenerateRequest,
)
from ai_anime.api.deps import get_sqlite_store
from ai_anime.modules.narrative_planning.public import (
    EpisodeContentWriteFailed,
    GenerateEpisodeRewriteCommand,
    clear_adapted_episode_content,
    enqueue_episode_rewrite_generation,
    load_adapted_episode_content,
    load_raw_episode_content,
    save_adapted_episode_content,
    save_raw_episode_content,
)
from ai_anime.sqlite_store import SQLiteStore

logger = logging.getLogger("ai_anime.api.content")

router = APIRouter()


@router.get("/projects/{project}/episodes/{episode_num}/raw-content")
async def get_raw_content(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """读取指定集的原文。"""
    content = await load_raw_episode_content(store, episode_num)
    return {"ok": True, "data": content.as_dict()}


@router.put("/projects/{project}/episodes/{episode_num}/raw-content")
async def put_raw_content(
    project: str,
    episode_num: int,
    body: ContentUpdateRequest,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """保存指定集的原文。"""
    logger.info("[%s] EP%d put_raw_content: %d chars", project, episode_num, len(body.content))
    saved = await save_raw_episode_content(store, episode_num, body.content)
    return {"ok": True, "data": saved.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/adapted-content")
async def get_adapted_content(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """读取指定集的改写稿。未保存时返回空串。"""
    content = await load_adapted_episode_content(store, episode_num)
    return {"ok": True, "data": content.as_dict()}


@router.put("/projects/{project}/episodes/{episode_num}/adapted-content")
async def put_adapted_content(
    project: str,
    episode_num: int,
    body: ContentUpdateRequest,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """保存指定集的改写稿。集不存在时返回 400。"""
    logger.info(
        "[%s] EP%d put_adapted_content: %d chars",
        project,
        episode_num,
        len(body.content),
    )
    try:
        saved = await save_adapted_episode_content(store, episode_num, body.content)
    except EpisodeContentWriteFailed as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": saved.as_dict()}


@router.delete("/projects/{project}/episodes/{episode_num}/adapted-content")
async def delete_adapted_content(
    project: str,
    episode_num: int,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """清空指定集的改写稿，回退到原文。"""
    logger.info("[%s] EP%d delete_adapted_content", project, episode_num)
    try:
        cleared = await clear_adapted_episode_content(store, episode_num)
    except EpisodeContentWriteFailed as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": cleared.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/rewrite/generate")
async def generate_rewrite(
    project: str,
    episode_num: int,
    body: RewriteGenerateRequest,
    user: dict = Depends(get_api_user),
):
    """提交“原文 → 逐行解说工作稿”生成任务。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    command = GenerateEpisodeRewriteCommand(
        episode_num=episode_num,
        target_beats=body.target_beats,
        beat_chars_min=body.beat_chars_min,
        beat_chars_max=body.beat_chars_max,
        narration_style=body.narration_style,
    )
    scheduled = await enqueue_episode_rewrite_generation(resolved.ctx, command)
    return {"ok": True, **scheduled.as_dict()}

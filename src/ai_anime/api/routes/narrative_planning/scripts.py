"""剧本生成与 Beat 编辑端点。

2.0 主线以 SQLite/Cognee 为唯一脚本状态源；不再读写 scripts/epXXX_script.json。
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger("ai_anime.api.scripts")

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import (
    make_cognee_store,
    make_cognee_store_for_context,
    make_sqlite_store_for_context,
    make_sqlite_store,
    resolve_project_scope,
)
from ai_anime.api.routes.narrative_planning.scripts_schemas import (
    BeatUpdate,
    BeatVideoPromptGenerateRequest,
    Seedance2PromptGenerateRequest,
    ScriptGenerateRequest,
    ScriptSaveRequest,
)
from ai_anime.modules.narrative_planning.public import (
    BeatNotFound,
    BeatStoreUpdateFailed,
    GenerateSeedancePromptCommand,
    IdentityPlanRequired,
    ProjectContextRequired,
    SeedancePromptRejected,
    ScriptNotFound,
    ScriptStoreSyncFailed,
    enqueue_beat_video_prompt_generation,
    generate_and_save_beat_video_prompt,
    generate_seedance2_beat_prompt,
    load_episode_script,
    resolve_beat_video_prompt_target,
    save_episode_script,
    start_episode_script_generation,
    update_episode_script_beat,
)

router = APIRouter()


def _requester_user_id_for_billing(resolved: Any, user: dict) -> str:
    ctx = getattr(resolved, "ctx", None)
    return str(
        getattr(ctx, "requester_user_id", "")
        or user.get("id")
        or user.get("user_id")
        or user.get("username")
        or ""
    )


@router.get("/projects/{project}/episodes/{episode_num}/script")
async def get_script(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """获取指定集数的剧本。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")

    try:
        store = (
            await make_sqlite_store_for_context(resolved.ctx)
            if resolved.ctx
            else await make_sqlite_store(resolved.username, resolved.project_name)
        )
        script_data = await load_episode_script(store, episode_num)
        if script_data:
            return {"ok": True, "data": script_data}
    except Exception as exc:
        logger.exception("从 store 读取剧本失败: episode=%s", episode_num)
        raise HTTPException(status_code=500, detail=f"Script store read failed: {exc}") from exc

    return {"ok": True, "data": None, "message": "Script not generated yet"}


@router.post("/projects/{project}/episodes/{episode_num}/script/generate")
async def generate_script(
    project: str,
    episode_num: int,
    body: ScriptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """生成指定集数的剧本。"""
    logger.info("[%s] EP%d generate_script", project, episode_num)
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    try:
        scheduled = await start_episode_script_generation(
            store,
            task_context=ctx,
            output_dir=output_dir,
            episode_num=episode_num,
        )
    except IdentityPlanRequired as exc:
        return {
            "ok": False,
            "code": exc.code,
            "error": str(exc),
        }
    except ProjectContextRequired as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.patch("/projects/{project}/episodes/{episode_num}/beats/{beat_num}")
async def update_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: BeatUpdate,
    user: dict = Depends(get_api_user),
):
    """编辑指定 Beat。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    logger.info(
        "[%s] EP%d update_beat: beat=%d, fields=%s",
        project,
        episode_num,
        beat_num,
        list(body.model_dump(exclude_none=True).keys()),
    )
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    updates = body.model_dump(exclude_none=True)
    try:
        target = await update_episode_script_beat(
            store,
            episode_num=episode_num,
            beat_num=beat_num,
            updates=updates,
        )
    except (ScriptNotFound, BeatNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BeatStoreUpdateFailed as exc:
        logger.exception(
            "Beat 保存失败: episode=%s beat=%s", episode_num, beat_num
        )
        raise HTTPException(status_code=500, detail=f"Beat store update failed: {exc}") from exc

    return {"ok": True, "data": target}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video-prompt/generate")
async def generate_beat_video_prompt(
    project: str,
    episode_num: int,
    beat_num: int,
    body: BeatVideoPromptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """AI 生成 1.x 单个 Beat 的视频提示词并保存。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    body = body or BeatVideoPromptGenerateRequest()

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )

    try:
        selection = await resolve_beat_video_prompt_target(
            store,
            episode_num=episode_num,
            beat_num=beat_num,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    if resolved.ctx is not None:
        scheduled = await enqueue_beat_video_prompt_generation(
            resolved.ctx,
            episode_num=episode_num,
            beat_num=beat_num,
            field=selection.field,
            language=body.language,
            output_dir=resolved.output_dir,
        )
        return {"ok": True, **scheduled.as_dict()}

    try:
        generated = await generate_and_save_beat_video_prompt(
            store,
            output_dir=resolved.output_dir,
            project_name=resolved.project_name,
            episode_num=episode_num,
            beat_num=beat_num,
            language=body.language,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        logger.exception(
            "Beat 视频提示词生成失败: episode=%s beat=%s", episode_num, beat_num
        )
        raise HTTPException(status_code=500, detail=f"Beat video prompt generation failed: {exc}") from exc

    return {
        "ok": True,
        "data": generated.as_dict(),
    }


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2-prompt/generate")
async def generate_seedance2_prompt(
    project: str,
    episode_num: int,
    beat_num: int,
    body: Seedance2PromptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """AI 生成单个 Beat 的 Seedance2 final_prompt 并保存回配置 JSON。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    project_dir = resolved.project_dir
    body = body or Seedance2PromptGenerateRequest()

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    ctx = getattr(resolved, "ctx", None)
    try:
        generated = await generate_seedance2_beat_prompt(
            store,
            GenerateSeedancePromptCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                project_dir=project_dir,
                requester_user_id=_requester_user_id_for_billing(
                    resolved,
                    user,
                ),
                project_id=str(getattr(ctx, "project_id", "") or ""),
                manual_prompt_reference=body.manual_prompt_reference,
                prompt_guidance=body.prompt_guidance,
            ),
        )
    except (ScriptNotFound, BeatNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SeedancePromptRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": generated.as_dict()}


@router.put("/projects/{project}/episodes/{episode_num}/script")
async def save_script(
    project: str,
    episode_num: int,
    body: ScriptSaveRequest,
    user: dict = Depends(get_api_user),
):
    """保存（覆盖）指定集数的完整剧本。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    logger.info("[%s] EP%d save_script: %d beats", project, episode_num, len(body.beats))

    store = (
        await make_cognee_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_cognee_store(resolved.username, resolved.project_name)
    )
    try:
        saved = await save_episode_script(
            store,
            episode_num=episode_num,
            beats=body.beats,
        )
    except ScriptStoreSyncFailed as exc:
        logger.exception("完整脚本保存后回写图谱失败: episode=%s", episode_num)
        raise HTTPException(
            status_code=500,
            detail=f"Script store sync failed: {exc}",
        ) from exc

    return {
        "ok": True,
        "data": saved.as_dict(),
    }

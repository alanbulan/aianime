"""分集列表 & 规划 & 身份端点。"""

import logging
from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import (
    make_sqlite_store,
    make_sqlite_store_for_context,
    resolve_project_scope,
)
from ai_anime.api.routes.narrative_planning.episodes_schemas import (
    EpisodePlanRequest,
    EpisodeUpdate,
    InsertManualShotRequest,
)
from ai_anime.modules.narrative_planning.public import (
    EpisodeNotFound,
    ProjectContextRequired,
    delete_manual_shot,
    get_episode_beats,
    get_episode_details,
    insert_manual_shot,
    list_episode_summaries,
    start_episode_asset_planning,
    start_episode_identity_planning,
    start_episode_planning,
    update_episode_metadata,
)
from ai_anime.modules.story_intake.public import (
    StoryImportRequired,
    build_chapter_preview,
    story_import_required_response,
)

logger = logging.getLogger("ai_anime.api.episodes")

router = APIRouter()


async def _enqueue_episode_asset_planner(
    project: str,
    episode_num: int,
    asset_kind: str,
    user: dict,
) -> dict:
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await start_episode_asset_planning(
            resolved.ctx,
            episode_num=episode_num,
            asset_kind=asset_kind,
        )
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    return {
        "ok": True,
        **scheduled.as_dict(),
        "data": {"target_episode": episode_num, "asset_kind": asset_kind},
    }


@router.get("/projects/{project}/episodes")
async def list_episodes(project: str, user: dict = Depends(get_api_user)):
    """获取项目分集列表。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")

    store = await make_sqlite_store_for_context(resolved.ctx)
    return {"ok": True, "data": list_episode_summaries(store)}


@router.post("/projects/{project}/episodes/plan")
async def plan_episodes(project: str, body: EpisodePlanRequest, user: dict = Depends(get_api_user)):
    """规划分集。"""
    logger.info(
        "[%s] plan_episodes: target=%d, mode=%s",
        project,
        body.target_episodes,
        body.planning_mode,
    )
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    output_dir = resolved.output_dir
    state_dir = resolved.state_dir

    try:
        scheduled = await start_episode_planning(
            ctx,
            target_episodes=body.target_episodes,
            planning_mode=body.planning_mode,
            output_dir=output_dir,
            state_dir=state_dir,
        )
    except StoryImportRequired:
        return story_import_required_response()
    except ProjectContextRequired as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}")
async def get_episode_detail(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """获取指定集的完整详情。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    try:
        data = get_episode_details(store, episode_num)
    except EpisodeNotFound as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/episodes/{episode_num}/beats")
async def get_beats(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """获取指定集数的 beats。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    beats = await get_episode_beats(
        store,
        episode_num=episode_num,
        project_dir=resolved.project_dir,
        project_context=resolved.ctx,
    )

    return {"ok": True, "data": beats}


@router.delete("/projects/{project}/episodes/{episode_num}/beats/{beat_number}/manual-shot")
async def delete_manual_shot_route(
    project: str,
    episode_num: int,
    beat_number: int,
    user: dict = Depends(get_api_user),
):
    """删除手工插入的 beat。普通主流程 beat 不允许从这里删。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    logger.info("[%s] EP%d delete_manual_shot beat=%d", project, episode_num, beat_number)
    try:
        beats = await delete_manual_shot(
            store,
            episode_number=episode_num,
            beat_number=beat_number,
        )
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    return {"ok": True, "data": {"beats": beats}}


@router.post("/projects/{project}/episodes/{episode_num}/beats/insert-manual")
async def insert_manual_shot_route(
    project: str,
    episode_num: int,
    body: InsertManualShotRequest,
    user: dict = Depends(get_api_user),
):
    """插入手工 beat；after_beat_number=None 表示插到第一张前。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")

    visual_description = (body.visual_description or "").strip()
    if not visual_description:
        return {"ok": False, "error": "visual_description 不能为空"}

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    scene_ref = body.scene_ref.model_dump(exclude_none=True) if body.scene_ref else None
    logger.info(
        "[%s] EP%d insert_manual_shot: after=%s, has_scene_ref=%s",
        project,
        episode_num,
        body.after_beat_number,
        bool(scene_ref),
    )
    try:
        new_beat = await insert_manual_shot(
            store,
            episode_number=episode_num,
            after_beat_number=body.after_beat_number,
            visual_description=visual_description,
            duration_seconds=body.duration_seconds,
            scene_ref=scene_ref,
            time_of_day=body.time_of_day,
            detected_identities=body.detected_identities,
            detected_props=body.detected_props,
            audio_type=body.audio_type,
            speaker=body.speaker,
            narration_segment=body.narration_segment,
        )
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    return {"ok": True, "data": new_beat}


@router.post("/projects/{project}/episodes/{episode_num}/identities/plan")
async def plan_episode_identities(
    project: str, episode_num: int, user: dict = Depends(get_api_user)
):
    """规划单集角色身份。"""
    logger.info("[%s] EP%d plan_episode_identities", project, episode_num)
    resolved = await resolve_project_scope(project, user, required_role="editor")
    scheduled = await start_episode_identity_planning(
        resolved.ctx,
        episode_num=episode_num,
    )
    return {
        "ok": True,
        **scheduled.as_dict(),
        "data": {"target_episode": episode_num},
    }


@router.post("/projects/{project}/episodes/{episode_num}/scenes/plan")
async def plan_episode_scenes(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """规划单集场景菜单。"""
    logger.info("[%s] EP%d plan_episode_scenes", project, episode_num)
    return await _enqueue_episode_asset_planner(
        project=project,
        episode_num=episode_num,
        asset_kind="scene",
        user=user,
    )


@router.post("/projects/{project}/episodes/{episode_num}/props/plan")
async def plan_episode_props(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """规划单集道具菜单。"""
    logger.info("[%s] EP%d plan_episode_props", project, episode_num)
    return await _enqueue_episode_asset_planner(
        project=project,
        episode_num=episode_num,
        asset_kind="prop",
        user=user,
    )


@router.patch("/projects/{project}/episodes/{episode_num}")
async def update_episode(
    project: str,
    episode_num: int,
    body: EpisodeUpdate,
    user: dict = Depends(get_api_user),
):
    """编辑指定集的元数据。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )

    updates = body.model_dump(exclude_none=True)
    try:
        data = await update_episode_metadata(
            store,
            episode_num=episode_num,
            updates=updates,
        )
    except EpisodeNotFound as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": data}


@router.get("/projects/{project}/chapters")
async def detect_chapters(project: str, user: dict = Depends(get_api_user)):
    """检测已上传小说的章节结构。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    novel_text = store.load_novel_content()
    if not novel_text:
        return {"ok": False, "error": "No novel file found. Upload a novel first."}

    return {
        "ok": True,
        "data": build_chapter_preview(novel_text),
    }

"""Production media pool endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import PoolSelectRequest, VideoPoolSelectRequest
from ai_anime.modules.production.public import (
    GridPoolImageStale,
    GridPoolSelectionRejected,
    SelectGridPoolImageCommand,
    VideoPoolEntryUnavailable,
    grid_pool_use_cases,
    video_pool_use_cases,
)

router = APIRouter()


@router.get("/projects/{project}/episodes/{episode_num}/video-pool")
async def list_video_pool(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the generated video pool for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    pool = video_pool_use_cases().list_pool(resolved.ctx, episode_num)
    return {"ok": True, "data": pool.as_dict() if pool is not None else None}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video-pool-select"
)
async def select_video_pool(
    project: str,
    episode_num: int,
    beat_num: int,
    body: VideoPoolSelectRequest,
    user: dict = Depends(get_api_user),
):
    """Assign one generated video pool entry to a Beat."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        selected = video_pool_use_cases().select(
            resolved.ctx,
            episode_num,
            beat_num,
            body.pool_id,
        )
    except VideoPoolEntryUnavailable as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": selected.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/grids")
async def list_grids(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the image pool and grid previews for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    listing = await grid_pool_use_cases().list_pool(resolved.ctx, episode_num)
    return {
        "ok": True,
        "data": listing.as_dict() if listing is not None else None,
    }


@router.post("/projects/{project}/episodes/{episode_num}/grids/rebuild-pool")
async def rebuild_grids_pool_index(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Rebuild an episode image pool index."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    return {
        "ok": True,
        "data": grid_pool_use_cases().rebuild(
            resolved.ctx,
            episode_num,
        ).as_dict(),
    }


@router.get(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch-candidates"
)
async def get_beat_sketch_candidates(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """Return current and generated sketch candidates for one Beat."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    candidates = await grid_pool_use_cases().sketch_candidates(
        resolved.ctx,
        episode_num,
        beat_num,
    )
    return {"ok": True, "data": candidates.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/pool-select")
async def select_pool_image(
    project: str,
    episode_num: int,
    beat_num: int,
    body: PoolSelectRequest,
    user: dict = Depends(get_api_user),
):
    """Assign one image pool entry to a Beat."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        selected = await grid_pool_use_cases().select(
            resolved.ctx,
            SelectGridPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                pool_id=body.pool_id,
                force=body.force,
            ),
        )
    except GridPoolImageStale as exc:
        return {"ok": False, "stale": True, "error": str(exc)}
    except GridPoolSelectionRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": selected.as_dict()}


__all__ = ["router"]

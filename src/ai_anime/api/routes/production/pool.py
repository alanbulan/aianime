"""Production media pool endpoints."""

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.production.pool_schemas import (
    GridCutRequest,
    GridSketchPreviewRequest,
    PoolSelectRequest,
    VideoPoolSelectRequest,
)
from ai_anime.modules.production.public import (
    CutGridCommand,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolPreviewRejected,
    GridPoolPromptRejected,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    GridPromptQuery,
    GridSketchPreviewCommand,
    SelectGridPoolImageCommand,
    UploadBeatPoolImageCommand,
    UploadGridImageCommand,
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


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/sketch/upload"
)
async def upload_beat_sketch(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload a canonical Beat sketch and add it to the image pool."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload(
            resolved.ctx,
            UploadBeatPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                content=content,
                image_type="sketch",
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/beats/{beat_num}/render/upload"
)
async def upload_beat_render(
    project: str,
    episode_num: int,
    beat_num: int,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """Upload a canonical Beat render and add it to the image pool."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload(
            resolved.ctx,
            UploadBeatPoolImageCommand(
                episode_num=episode_num,
                beat_num=beat_num,
                content=content,
                image_type="render",
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/upload")
async def upload_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    file: UploadFile = File(...),
    grid_type: str = Form("render"),
    mode_key: str = Form(""),
    beat_numbers: str = Form(""),
    user: dict = Depends(get_api_user),
):
    """Upload a complete grid image and update its pool entry."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    content = await file.read()
    try:
        uploaded = grid_pool_use_cases().upload_grid(
            resolved.ctx,
            UploadGridImageCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                filename=file.filename,
                content=content,
                grid_type=grid_type,
                mode_key=mode_key,
                beat_numbers=beat_numbers,
            ),
        )
    except GridPoolUploadRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": uploaded.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/prompt")
async def export_grid_prompt(
    project: str,
    episode_num: int,
    grid_index: int,
    grid_type: str = Query("render"),
    mode_key: str = Query(""),
    beat_numbers: str = Query(""),
    user: dict = Depends(get_api_user),
):
    """Return the stored prompt for one generated grid."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        prompt = grid_pool_use_cases().prompt(
            resolved.ctx,
            GridPromptQuery(
                episode_num=episode_num,
                grid_index=grid_index,
                grid_type=grid_type,
                mode_key=mode_key,
                beat_numbers=beat_numbers,
            ),
        )
    except GridPoolPromptRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": prompt.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/grids/{grid_index}/sketch-preview"
)
async def sketch_grid_preview(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridSketchPreviewRequest,
    user: dict = Depends(get_api_user),
):
    """Build a temporary sketch grid preview."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        preview = grid_pool_use_cases().preview(
            resolved.ctx,
            GridSketchPreviewCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                rows=body.rows,
                cols=body.cols,
                beat_numbers=tuple(body.beat_numbers),
            ),
        )
    except GridPoolPreviewRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": preview.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/cut")
async def cut_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridCutRequest,
    user: dict = Depends(get_api_user),
):
    """Split one grid image into Beat pool cells."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        result = grid_pool_use_cases().cut(
            resolved.ctx,
            CutGridCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                grid_type=body.grid_type,
                mode_key=body.mode_key,
                rows=body.rows,
                cols=body.cols,
                beat_start=body.beat_start,
                beat_end=body.beat_end,
                beat_numbers=(
                    tuple(body.beat_numbers)
                    if body.beat_numbers is not None
                    else None
                ),
            ),
        )
    except GridPoolCutRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "data": result.as_dict()}


__all__ = ["router"]

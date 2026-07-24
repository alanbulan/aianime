"""Production episode video endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import GlobalOptimizeRequest, VideoComposeRequest
from ai_anime.modules.production.public import (
    ComposeEpisodeVideoCommand,
    EpisodeBeatsMissing,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    OptimizeEpisodeVideoCommand,
    episode_video_use_cases,
    global_video_optimization_use_cases,
    video_backend_catalog_use_cases,
)

router = APIRouter()


@router.get("/projects/{project}/video-backends")
async def get_video_backend_options(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return the available video generation backends."""
    await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": [
            item.as_dict()
            for item in video_backend_catalog_use_cases().list_options()
        ],
    }


@router.post("/projects/{project}/episodes/{episode_num}/optimize/video-global")
async def global_optimize_video(
    project: str,
    episode_num: int,
    body: GlobalOptimizeRequest = GlobalOptimizeRequest(),
    user: dict = Depends(get_api_user),
):
    """Queue global video prompt optimization for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await global_video_optimization_use_cases().schedule(
            resolved.ctx,
            OptimizeEpisodeVideoCommand(
                episode_num=episode_num,
                language=body.language,
            ),
        )
    except (
        GlobalVideoOptimizationBeatsMissing,
        GlobalVideoOptimizationSketchesMissing,
    ) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/videos/compose")
async def compose_video(
    project: str,
    episode_num: int,
    body: VideoComposeRequest,
    user: dict = Depends(get_api_user),
):
    """Queue final episode video composition."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await episode_video_use_cases().compose(
            resolved.ctx,
            ComposeEpisodeVideoCommand(
                episode_num=episode_num,
                add_subtitles=body.add_subtitles,
                add_bgm=body.add_bgm,
                resolution=body.resolution,
            ),
        )
    except EpisodeBeatsMissing as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.get("/projects/{project}/episodes/{episode_num}/final")
async def get_final_video(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the composed episode video status."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    status_data = episode_video_use_cases().final_status(
        resolved.ctx,
        episode_num,
    )
    return {"ok": True, "data": status_data.as_dict()}


__all__ = ["router"]

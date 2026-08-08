"""Production episode export endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.production.public import (
    EpisodeScriptBeatsMissing,
    EpisodeSubtitlesMissing,
    FinalEpisodeVideoMissing,
    episode_export_use_cases,
)

router = APIRouter()


@router.get("/projects/{project}/episodes/{episode_num}/export/srt")
async def export_srt(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Export an episode SRT subtitle file."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        exported = await episode_export_use_cases().subtitle(
            resolved.ctx,
            episode_num,
        )
    except (EpisodeScriptBeatsMissing, EpisodeSubtitlesMissing) as exc:
        return {"ok": False, "error": str(exc)}

    return PlainTextResponse(
        content=exported.content,
        media_type=exported.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{exported.filename}"',
        },
    )


@router.get("/projects/{project}/episodes/{episode_num}/export/video")
async def export_final_video(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Download the composed final episode video."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        exported = episode_export_use_cases().final_video(
            resolved.ctx,
            episode_num,
        )
    except FinalEpisodeVideoMissing as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path=str(exported.path),
        filename=exported.filename,
        media_type=exported.media_type,
    )


@router.post("/projects/{project}/episodes/{episode_num}/export/zip")
async def export_zip(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Package all episode assets as a ZIP download."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    exported = await episode_export_use_cases().archive(
        resolved.ctx,
        episode_num,
    )
    return FileResponse(
        path=str(exported.path),
        filename=exported.filename,
        media_type=exported.media_type,
    )


__all__ = ["router"]

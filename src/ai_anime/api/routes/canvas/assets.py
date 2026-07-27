"""Creative Canvas director-capture and scene-asset endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasBeatNotFound,
    GetCreativeCanvasDirectorCaptureQuery,
    GetCreativeCanvasSceneAssetsQuery,
    InvalidCreativeCanvasBeatContextQuery,
    ListCreativeCanvasAssetsQuery,
    ListCreativeCanvasBeatContextAssetsQuery,
    SyncCreativeCanvasDirectorBackgroundCommand,
    creative_canvas_asset_use_cases,
)


router = APIRouter()


@router.get(
    "/projects/{project}/freezone/assets",
    tags=["freezone-assets"],
)
async def list_freezone_assets(
    project: str,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    data = await creative_canvas_asset_use_cases().list_assets(
        ListCreativeCanvasAssetsQuery(
            context=resolved.ctx,
            project_id=project,
            project_dir=resolved.project_dir,
        )
    )
    return {"ok": True, "data": list(data)}


@router.get(
    "/projects/{project}/freezone/assets/beat-context",
    tags=["freezone-assets"],
)
async def list_freezone_beat_context_assets(
    project: str,
    episode: int | None = None,
    beat: int | None = None,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        data = await creative_canvas_asset_use_cases().list_beat_context_assets(
            ListCreativeCanvasBeatContextAssetsQuery(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                episode=episode,
                beat=beat,
            )
        )
    except InvalidCreativeCanvasBeatContextQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": data}


@router.get(
    "/projects/{project}/freezone/director-capture",
    tags=["freezone-assets"],
)
async def freezone_director_capture_manifest(
    project: str,
    episode: int,
    beat: int,
    canvas_id: str | None = None,
    node_id: str | None = None,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        data = await creative_canvas_asset_use_cases().director_capture(
            GetCreativeCanvasDirectorCaptureQuery(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                episode=int(episode),
                beat=int(beat),
                canvas_id=canvas_id,
                node_id=node_id,
            )
        )
    except CreativeCanvasBeatNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/director-capture/sync-background",
    tags=["freezone-assets"],
)
async def freezone_director_capture_sync_background(
    project: str,
    episode: int,
    beat: int,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_editor_project(project, user)
    data = creative_canvas_asset_use_cases().sync_director_background(
        SyncCreativeCanvasDirectorBackgroundCommand(
            project_dir=resolved.project_dir,
            episode=int(episode),
            beat=int(beat),
        )
    )
    return {"ok": True, "data": data}


@router.get(
    "/projects/{project}/freezone/scene-assets-for-beat",
    tags=["freezone-assets"],
)
async def freezone_scene_assets_for_beat(
    project: str,
    episode: int,
    beat: int,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        data = await creative_canvas_asset_use_cases().scene_assets_for_beat(
            GetCreativeCanvasSceneAssetsQuery(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                episode=int(episode),
                beat=int(beat),
            )
        )
    except CreativeCanvasBeatNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "data": data}


async def _resolve_viewer_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )


async def _resolve_editor_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )


__all__ = ["router"]

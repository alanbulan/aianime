"""Creative Canvas canonical-slot commit endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.canvas_commits_schemas import ImpactRequest, PushRequest
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CommitCreativeCanvasSlotCommand,
    CreativeCanvasSlotBeatNotFound,
    CreativeCanvasSlotSourceNotFound,
    GetCreativeCanvasSlotImpactQuery,
    InvalidCreativeCanvasSlotCommit,
    canvas_event_actor,
    creative_canvas_slot_commit_use_cases,
)


router = APIRouter()


@router.post(
    "/projects/{project}/freezone/impact",
    tags=["freezone-commit"],
)
async def freezone_impact(
    project: str,
    body: ImpactRequest,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        data = await creative_canvas_slot_commit_use_cases().impact(
            GetCreativeCanvasSlotImpactQuery(
                context=resolved.ctx,
                target=body.target.model_dump(mode="json"),
            )
        )
    except InvalidCreativeCanvasSlotCommit as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/push",
    tags=["freezone-commit"],
)
async def freezone_push(
    project: str,
    body: PushRequest,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_editor_project(project, user)
    try:
        data = await creative_canvas_slot_commit_use_cases().commit(
            CommitCreativeCanvasSlotCommand(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                target=body.target.model_dump(mode="json"),
                mark_stale=body.mark_stale,
                event_actor=canvas_event_actor(user),
            )
        )
    except InvalidCreativeCanvasSlotCommit as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasSlotSourceNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasSlotBeatNotFound as exc:
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

"""Creative Canvas projected-subgraph endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.canvas_errors import raise_canvas_document_http_error
from ai_anime.api.canvas_projections_schemas import (
    ProjectionPresetCanvasRequest,
    ProjectionRemoveRequest,
    ProjectionStatusRequest,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    BuildCreativeCanvasProjectionQuery,
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentWriteError,
    CreativeCanvasProjectionCanvasNotFound,
    CreativeCanvasPresetSourceNotFound,
    GetCreativeCanvasProjectionStatusQuery,
    InvalidCreativeCanvasPresetRequest,
    ProjectCreativeCanvasProjectionCommand,
    RemoveCreativeCanvasProjectionCommand,
    canvas_actor_id,
    canvas_event_actor,
    creative_canvas_projection_use_cases,
    is_valid_creative_canvas_id,
)


router = APIRouter()


@router.post(
    "/projects/{project}/freezone/projections:build-from-preset",
    tags=["freezone-canvas"],
)
async def build_projection_from_preset(
    project: str,
    body: ProjectionPresetCanvasRequest,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_editor_project(project, user)
    try:
        data = await creative_canvas_projection_use_cases().build(
            BuildCreativeCanvasProjectionQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                request=_projection_request(body),
            )
        )
    except InvalidCreativeCanvasPresetRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasPresetSourceNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/canvases/{canvas_id}/projections:from-preset",
    tags=["freezone-canvas"],
)
async def project_canvas_from_preset(
    project: str,
    canvas_id: str,
    body: ProjectionPresetCanvasRequest,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_editor_project(project, user)
    try:
        data = await creative_canvas_projection_use_cases().project(
            ProjectCreativeCanvasProjectionCommand(
                context=resolved.ctx,
                project_id=project,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                request=_projection_request(body),
                base_revision=body.base_revision,
                force_refresh=body.force_refresh,
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            )
        )
    except InvalidCreativeCanvasPresetRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasPresetSourceNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/canvases/{canvas_id}/projections:remove",
    tags=["freezone-canvas"],
)
async def remove_canvas_projection(
    project: str,
    canvas_id: str,
    body: ProjectionRemoveRequest,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_editor_project(project, user)
    try:
        data = creative_canvas_projection_use_cases().remove(
            RemoveCreativeCanvasProjectionCommand(
                context=resolved.ctx,
                project_id=project,
                canvas_id=canvas_id,
                projection_key=body.projection_key,
                base_revision=body.base_revision,
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            )
        )
    except CreativeCanvasProjectionCanvasNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/canvases/{canvas_id}/projections:status",
    tags=["freezone-canvas"],
)
async def projection_status(
    project: str,
    canvas_id: str,
    body: ProjectionStatusRequest,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_viewer_project(project, user)
    try:
        data = await creative_canvas_projection_use_cases().status(
            GetCreativeCanvasProjectionStatusQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                projection_keys=body.projection_keys,
            )
        )
    except CreativeCanvasProjectionCanvasNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except (CreativeCanvasDocumentCorrupt, CreativeCanvasDocumentBusy) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": data}


def _projection_request(body: ProjectionPresetCanvasRequest) -> dict:
    return body.model_dump(
        exclude={"base_revision", "force_refresh"},
        exclude_none=True,
    )


def _validate_canvas_id(canvas_id: str) -> None:
    if not is_valid_creative_canvas_id(canvas_id):
        raise HTTPException(400, "invalid canvas_id")


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

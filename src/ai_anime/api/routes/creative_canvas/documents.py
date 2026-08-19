"""Creative Canvas document endpoints."""

import asyncio

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.creative_canvas.documents_schemas import CanvasPayload
from ai_anime.api.routes.creative_canvas.errors import raise_canvas_document_http_error
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentWriteError,
    DeleteCreativeCanvasDocumentCommand,
    GetCreativeCanvasDocumentQuery,
    InvalidCreativeCanvasDocumentQuery,
    ListCreativeCanvasDocumentHistoryQuery,
    ListCreativeCanvasDocumentsQuery,
    ListCreativeCanvasGenerationHistoryQuery,
    ListCreativeCanvasNodeGenerationHistoryQuery,
    RestoreCreativeCanvasDocumentCommand,
    SaveCreativeCanvasDocumentCommand,
    canvas_actor_id,
    canvas_event_actor,
    creative_canvas_document_commands,
    creative_canvas_document_queries,
    is_valid_creative_canvas_id,
)

router = APIRouter()


@router.get(
    "/projects/{project}/freezone/canvases",
    tags=["freezone-canvas"],
)
async def list_canvases(
    project: str,
    user: dict = Depends(get_api_user),
):
    resolved = await _resolve_viewer_project(project, user)
    try:
        documents = await asyncio.to_thread(
            creative_canvas_document_queries().list_documents,
            ListCreativeCanvasDocumentsQuery(
                context=resolved.ctx,
                actor_id=canvas_actor_id(user),
            ),
        )
    except (CreativeCanvasDocumentCorrupt, CreativeCanvasDocumentBusy) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": documents}


@router.get(
    "/projects/{project}/freezone/canvases/{canvas_id}",
    tags=["freezone-canvas"],
)
async def get_canvas(
    project: str,
    canvas_id: str,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_viewer_project(project, user)
    try:
        document = await creative_canvas_document_queries().get_document(
            GetCreativeCanvasDocumentQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                actor_id=canvas_actor_id(user),
            )
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    except (CreativeCanvasDocumentCorrupt, CreativeCanvasDocumentBusy) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": document}


@router.get(
    "/projects/{project}/freezone/canvases/{canvas_id}/history",
    tags=["freezone-canvas"],
)
async def list_canvas_history(
    project: str,
    canvas_id: str,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_viewer_project(project, user)
    try:
        history = await asyncio.to_thread(
            creative_canvas_document_queries().list_document_history,
            ListCreativeCanvasDocumentHistoryQuery(
                context=resolved.ctx,
                canvas_id=canvas_id,
            ),
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasDocumentCorrupt as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": history}


@router.get(
    "/projects/{project}/freezone/canvases/{canvas_id}/nodes/{node_id}/generation-history",
    tags=["freezone-canvas"],
)
async def get_node_generation_history(
    project: str,
    canvas_id: str,
    node_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_api_user),
):
    """Return generation attempts recorded for one canvas node."""
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_viewer_project(project, user)
    try:
        records = await asyncio.to_thread(
            creative_canvas_document_queries().list_node_generation_history,
            ListCreativeCanvasNodeGenerationHistoryQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                node_id=node_id,
                limit=limit,
            ),
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": {"records": records}}


@router.get(
    "/projects/{project}/freezone/canvases/{canvas_id}/generation-history",
    tags=["freezone-canvas"],
)
async def get_canvas_generation_history(
    project: str,
    canvas_id: str,
    limit: int = Query(500, ge=1, le=2000),
    user: dict = Depends(get_api_user),
):
    """Return every node's generation attempts for a whole canvas."""
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_viewer_project(project, user)
    try:
        records = await asyncio.to_thread(
            creative_canvas_document_queries().list_generation_history,
            ListCreativeCanvasGenerationHistoryQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                limit=limit,
            ),
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": {"records": records}}


@router.post(
    "/projects/{project}/freezone/canvases/{canvas_id}/restore",
    tags=["freezone-canvas"],
)
async def restore_canvas_history(
    project: str,
    canvas_id: str,
    body: dict = Body(...),
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_editor_project(project, user)
    try:
        response = await asyncio.to_thread(
            creative_canvas_document_commands().restore,
            RestoreCreativeCanvasDocumentCommand(
                context=resolved.ctx,
                project_id=project,
                canvas_id=canvas_id,
                history_id=str(body.get("history_id") or "").strip(),
                base_revision=body.get("base_revision"),
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            ),
        )
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": response}


@router.put(
    "/projects/{project}/freezone/canvases/{canvas_id}",
    tags=["freezone-canvas"],
)
async def put_canvas(
    project: str,
    canvas_id: str,
    body: CanvasPayload,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_editor_project(project, user)
    try:
        response = await asyncio.to_thread(
            creative_canvas_document_commands().save,
            SaveCreativeCanvasDocumentCommand(
                context=resolved.ctx,
                project_id=project,
                canvas_id=canvas_id,
                payload=body.model_dump(
                    exclude={
                        "base_revision",
                        "client_save_id",
                        "allow_empty_overwrite",
                    },
                    exclude_none=True,
                ),
                request_hash_payload=body.model_dump(
                    exclude={"client_save_id"},
                    exclude_none=True,
                ),
                base_revision=body.base_revision,
                client_save_id=body.client_save_id,
                save_source=body.save_source,
                allow_empty_overwrite=body.allow_empty_overwrite,
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            ),
        )
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": response}


@router.delete(
    "/projects/{project}/freezone/canvases/{canvas_id}",
    tags=["freezone-canvas"],
)
async def delete_canvas(
    project: str,
    canvas_id: str,
    user: dict = Depends(get_api_user),
):
    _validate_canvas_id(canvas_id)
    resolved = await _resolve_editor_project(project, user)
    try:
        response = await asyncio.to_thread(
            creative_canvas_document_commands().delete,
            DeleteCreativeCanvasDocumentCommand(
                context=resolved.ctx,
                project_id=project,
                canvas_id=canvas_id,
                actor_id=canvas_actor_id(user),
                event_actor=canvas_event_actor(user),
            ),
        )
    except (
        CreativeCanvasDocumentWriteError,
        CreativeCanvasDocumentCorrupt,
        CreativeCanvasDocumentBusy,
    ) as exc:
        raise_canvas_document_http_error(exc)
    return {"ok": True, "data": response}


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

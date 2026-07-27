"""Creative Canvas document-query endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.freezone.paths import CANVAS_ID_RE
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    InvalidCreativeCanvasDocumentQuery,
    ListCreativeCanvasDocumentHistoryQuery,
    ListCreativeCanvasDocumentsQuery,
    ListCreativeCanvasGenerationHistoryQuery,
    ListCreativeCanvasNodeGenerationHistoryQuery,
    canvas_actor_id,
    creative_canvas_document_queries,
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
        documents = creative_canvas_document_queries().list_documents(
            ListCreativeCanvasDocumentsQuery(
                context=resolved.ctx,
                actor_id=canvas_actor_id(user),
            )
        )
    except CreativeCanvasDocumentCorrupt as exc:
        raise HTTPException(500, str(exc)) from exc
    except CreativeCanvasDocumentBusy as exc:
        raise HTTPException(
            503,
            {"code": "canvas_lock_busy", "canvas_id": exc.canvas_id},
            headers={"Retry-After": "1"},
        ) from exc
    return {"ok": True, "data": documents}


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
        history = creative_canvas_document_queries().list_document_history(
            ListCreativeCanvasDocumentHistoryQuery(
                context=resolved.ctx,
                canvas_id=canvas_id,
            )
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasDocumentCorrupt as exc:
        raise HTTPException(500, str(exc)) from exc
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
        records = creative_canvas_document_queries().list_node_generation_history(
            ListCreativeCanvasNodeGenerationHistoryQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                node_id=node_id,
                limit=limit,
            )
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
        records = creative_canvas_document_queries().list_generation_history(
            ListCreativeCanvasGenerationHistoryQuery(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                canvas_id=canvas_id,
                limit=limit,
            )
        )
    except InvalidCreativeCanvasDocumentQuery as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "data": {"records": records}}


def _validate_canvas_id(canvas_id: str) -> None:
    if not CANVAS_ID_RE.match(canvas_id):
        raise HTTPException(400, "invalid canvas_id")


async def _resolve_viewer_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )


__all__ = ["router"]

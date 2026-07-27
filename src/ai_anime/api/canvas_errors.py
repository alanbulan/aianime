"""HTTP error mapping for Creative Canvas document operations."""

from __future__ import annotations

from typing import NoReturn

from fastapi import HTTPException

from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasDocumentBaseRevisionRequired,
    CreativeCanvasDocumentBusy,
    CreativeCanvasDocumentCorrupt,
    CreativeCanvasDocumentHistoryNotFound,
    CreativeCanvasDocumentIdempotencyConflict,
    CreativeCanvasDocumentRevisionConflict,
    CreativeCanvasDocumentStorageFailed,
    DangerousCreativeCanvasDocumentOverwrite,
    InvalidCreativeCanvasDocumentHistoryId,
)


def raise_canvas_document_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, CreativeCanvasDocumentCorrupt):
        raise HTTPException(500, str(exc)) from exc
    if isinstance(exc, CreativeCanvasDocumentBaseRevisionRequired):
        raise HTTPException(409, str(exc)) from exc
    if isinstance(exc, CreativeCanvasDocumentRevisionConflict):
        raise HTTPException(
            409,
            {
                "code": "canvas_revision_conflict",
                "error": "canvas revision conflict",
                "current_revision": exc.current_revision,
                "base_revision": exc.base_revision,
            },
        ) from exc
    if isinstance(exc, CreativeCanvasDocumentIdempotencyConflict):
        raise HTTPException(
            409,
            {
                "code": "canvas_idempotency_conflict",
                "client_save_id": exc.client_save_id,
            },
        ) from exc
    if isinstance(exc, InvalidCreativeCanvasDocumentHistoryId):
        raise HTTPException(400, str(exc)) from exc
    if isinstance(exc, CreativeCanvasDocumentHistoryNotFound):
        raise HTTPException(404, str(exc)) from exc
    if isinstance(exc, DangerousCreativeCanvasDocumentOverwrite):
        raise HTTPException(
            400,
            {
                "code": "dangerous_empty_canvas_overwrite",
                "old_nodes": exc.old_nodes,
                "new_nodes": exc.new_nodes,
                "save_source": exc.save_source,
            },
        ) from exc
    if isinstance(exc, CreativeCanvasDocumentBusy):
        raise HTTPException(
            503,
            {"code": "canvas_lock_busy", "canvas_id": exc.canvas_id},
            headers={"Retry-After": "1"},
        ) from exc
    if isinstance(exc, CreativeCanvasDocumentStorageFailed):
        raise HTTPException(500, str(exc)) from exc
    raise exc


__all__ = ["raise_canvas_document_http_error"]

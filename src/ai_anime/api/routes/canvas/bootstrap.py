"""Creative Canvas bootstrap endpoint."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasBootstrapBusy,
    CreativeCanvasBootstrapCorrupt,
    InitializeCreativeCanvasCommand,
    canvas_actor_id,
    creative_canvas_bootstrap_use_cases,
)

router = APIRouter()


@router.post("/projects/{project}/freezone/init", tags=["freezone-bootstrap"])
async def init_freezone(project: str, user: dict = Depends(get_api_user)):
    """懒创建 Freezone 目录树，可重复调用且幂等。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = creative_canvas_bootstrap_use_cases().initialize(
            InitializeCreativeCanvasCommand(
                project_dir=resolved.project_dir,
                canvas_state_dir=Path(resolved.state_dir),
                project_id=resolved.ctx.project_id,
                actor_id=canvas_actor_id(user),
            )
        )
    except CreativeCanvasBootstrapCorrupt as exc:
        raise HTTPException(500, str(exc)) from exc
    except CreativeCanvasBootstrapBusy as exc:
        raise HTTPException(
            503,
            {"code": "canvas_lock_busy", "canvas_id": exc.canvas_id},
            headers={"Retry-After": "1"},
        ) from exc
    return {
        "ok": True,
        "data": {
            "freezone_dir": str(result.freezone_dir),
            "default_canvas": {
                "canvas_id": result.default_canvas_id,
                "created": result.default_canvas_created,
                "revision": result.default_canvas_revision,
            },
        },
    }


__all__ = ["router"]

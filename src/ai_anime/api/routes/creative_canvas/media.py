"""Creative Canvas media endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.creative_canvas.media_schemas import (
    FreezoneThreeDViewerScreenshotRequest,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasScreenshotTooLarge,
    InvalidCreativeCanvasPngScreenshot,
    SaveCreativeCanvasScreenshotCommand,
    StoreCreativeCanvasUploadCommand,
    creative_canvas_media_use_cases,
)

router = APIRouter()


@router.post("/projects/{project}/freezone/upload", tags=["freezone-media"])
async def freezone_upload(
    project: str,
    file: Annotated[UploadFile, File()],
    user: dict = Depends(get_api_user),
):
    """把外部资源上传保存到 `freezone/_uploads/`。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    result = creative_canvas_media_use_cases().upload(
        StoreCreativeCanvasUploadCommand(
            project_id=resolved.ctx.project_id,
            project_dir=resolved.project_dir,
            original_filename=file.filename,
            contents=await file.read(),
        )
    )
    return {
        "ok": True,
        "data": {
            "url": result.url,
            "filename": result.filename,
            "size": result.size,
        },
    }


@router.post(
    "/projects/{project}/freezone/three-d-viewer/screenshot",
    tags=["freezone-media"],
)
async def freezone_three_d_viewer_screenshot(
    project: str,
    body: FreezoneThreeDViewerScreenshotRequest,
    user: dict = Depends(get_api_user),
):
    """保存内置 3D viewer 普通截图到 Freezone 输出目录。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = creative_canvas_media_use_cases().save_screenshot(
            SaveCreativeCanvasScreenshotCommand(
                project_id=resolved.ctx.project_id,
                project_dir=resolved.project_dir,
                data_url=body.data_url,
                node_id=body.node_id,
                label=body.label,
            )
        )
    except InvalidCreativeCanvasPngScreenshot as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasScreenshotTooLarge as exc:
        raise HTTPException(413, str(exc)) from exc
    return {
        "ok": True,
        "data": {
            "id": result.screenshot_id,
            "label": result.label,
            "node_id": result.node_id,
            "rel_path": result.relative_path,
            "url": result.url,
            "media_type": "image",
            "size": result.size,
        },
    }


__all__ = ["router"]

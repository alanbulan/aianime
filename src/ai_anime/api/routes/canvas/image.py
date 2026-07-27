"""Creative Canvas image endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import FreezoneMarkDetectRequest, FreezoneMarkDetectResponse
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasMarkDetectionFailed,
    CreativeCanvasMarkSelection,
    DetectCreativeCanvasMarkCommand,
    InvalidCreativeCanvasMarkRequest,
    creative_canvas_mark_detection_use_cases,
    generation_catalog_queries,
)

router = APIRouter()


@router.get(
    "/projects/{project}/freezone/image/camera-options", tags=["freezone-image"]
)
async def freezone_image_camera_options(
    project: str,
    user: dict = Depends(get_api_user),
):
    """图片处理：返回摄像机参数选项列表。"""
    await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return {"ok": True, "data": generation_catalog_queries().image_camera_options()}


@router.get(
    "/projects/{project}/freezone/image/style-templates", tags=["freezone-image"]
)
async def freezone_image_style_templates(
    project: str,
    user: dict = Depends(get_api_user),
):
    """图片处理：返回内置风格模板列表。"""
    await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return {"ok": True, "data": generation_catalog_queries().image_style_templates()}


@router.get("/projects/{project}/freezone/image/models", tags=["freezone-image"])
async def freezone_image_models(
    project: str,
    user: dict = Depends(get_api_user),
):
    """图片处理：返回和 AI anime 图片模型下拉一致的可见模型。"""
    await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return {"ok": True, "data": generation_catalog_queries().image_models()}


@router.post(
    "/projects/{project}/freezone/marks/detect",
    response_model=FreezoneMarkDetectResponse,
    tags=["freezone-image"],
)
async def freezone_mark_detect(
    project: str,
    body: FreezoneMarkDetectRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：识别单张图片中点击点或框选区域的局部元素标记。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_mark_detection_use_cases().detect(
            DetectCreativeCanvasMarkCommand(
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                selection=CreativeCanvasMarkSelection(
                    point_x=body.point_x,
                    point_y=body.point_y,
                    box_x=body.box_x,
                    box_y=body.box_y,
                    box_width=body.box_width,
                    box_height=body.box_height,
                ),
            )
        )
    except InvalidCreativeCanvasMarkRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasMarkDetectionFailed as exc:
        raise HTTPException(500, str(exc)) from exc

    selection = result.selection
    return {
        "ok": True,
        "data": {
            "mark": {
                "label": result.label,
                "source_url": result.source_url,
                "point_x": selection.point_x,
                "point_y": selection.point_y,
                "box_x": selection.box_x,
                "box_y": selection.box_y,
                "box_width": selection.box_width,
                "box_height": selection.box_height,
                "note": result.note,
            },
            "provider": result.provider,
            "model": result.model,
        },
    }


__all__ = ["router"]

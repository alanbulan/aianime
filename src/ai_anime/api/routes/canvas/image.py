"""Creative Canvas image endpoints."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import (
    FreezoneImageTo3GSRequest,
    FreezoneImageCameraConfig,
    FreezoneImageReversePromptRequest,
    FreezoneImageStyleConfig,
    FreezoneJobAcceptedResponse,
    FreezoneMarkDetectRequest,
    FreezoneMarkDetectResponse,
    FreezoneOutpaintRequest,
    FreezoneRedrawRequest,
    FreezoneStageAssetAcceptedResponse,
    FreezoneUpscaleRequest,
)
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasImageToThreeGsSourceMissing,
    CreativeCanvasImageEditingSourceMissing,
    CreativeCanvasMarkDetectionFailed,
    CreativeCanvasMarkSelection,
    CreativeCanvasReversePromptSourceMissing,
    CreativeCanvasTaskStartFailed,
    DetectCreativeCanvasMarkCommand,
    InvalidCreativeCanvasReversePromptRequest,
    InvalidCreativeCanvasImageToThreeGsRequest,
    InvalidCreativeCanvasImageEditingRequest,
    InvalidCreativeCanvasMarkRequest,
    StartCreativeCanvasReversePromptCommand,
    StartCreativeCanvasImageToThreeGsCommand,
    StartCreativeCanvasImageEditingCommand,
    creative_canvas_image_to_three_gs_use_cases,
    creative_canvas_image_editing_use_cases,
    creative_canvas_mark_detection_use_cases,
    creative_canvas_reverse_prompt_use_cases,
    generation_catalog_queries,
)

logger = logging.getLogger("ai_anime.api.freezone")
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


@router.post(
    "/projects/{project}/freezone/image/reverse-prompt",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_image_reverse_prompt(
    project: str,
    body: FreezoneImageReversePromptRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：异步反推图片提示词。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_reverse_prompt_use_cases().start(
            StartCreativeCanvasReversePromptCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except InvalidCreativeCanvasReversePromptRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasReversePromptSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasTaskStartFailed as exc:
        logger.warning("reverse prompt failed: %s", exc, exc_info=True)
        raise HTTPException(500, f"reverse prompt failed: {exc}") from exc

    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "task_episode": result.task_episode,
        "task_scope": result.task_scope,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/image-to-3gs",
    response_model=FreezoneStageAssetAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_image_to_3gs(
    project: str,
    body: FreezoneImageTo3GSRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：把 Freezone 图片节点作为 SHARP 输入，生成 Freezone 3GS PLY。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_image_to_three_gs_use_cases().start(
            StartCreativeCanvasImageToThreeGsCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                source_kind=body.source_kind,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except InvalidCreativeCanvasImageToThreeGsRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasImageToThreeGsSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasTaskStartFailed as exc:
        logger.warning("failed to start image-to-3gs task: %s", exc, exc_info=True)
        raise HTTPException(503, f"failed to start image-to-3gs task: {exc}") from exc

    receipt = result.receipt
    data = {
        "task_type": receipt.task_type,
        "job_id": receipt.job_id,
        "scope": result.scope,
        "scene_id": result.scene_id,
        "step": result.step,
        "task_key": receipt.task_key,
        "backend": receipt.backend,
        "queue": receipt.queue,
    }
    if receipt.task_id:
        data["task_id"] = receipt.task_id
    return {"ok": True, "data": data}


@router.post("/projects/{project}/freezone/upscale", tags=["freezone-image"])
async def freezone_upscale(
    project: str,
    body: FreezoneUpscaleRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：高清放大接口。"""
    return await _start_image_editing(
        project=project,
        user=user,
        operation="upscale",
        source_url=body.source_url,
        image_size=body.image_size,
        model=body.model,
        quality=body.quality,
        requested_aspect_ratio="original",
        num_images=1,
        camera=body.camera,
        style=body.style,
        failure_label="upscale",
    )


@router.post(
    "/projects/{project}/freezone/outpaint",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_outpaint(
    project: str,
    body: FreezoneOutpaintRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：向外补画并保留中心主体与原始构图。"""
    return await _start_image_editing(
        project=project,
        user=user,
        operation="outpaint",
        source_url=body.source_url,
        image_size=body.image_size,
        model=body.model,
        quality=body.quality,
        requested_aspect_ratio=body.target_aspect_ratio,
        num_images=body.num_images,
        camera=body.camera,
        style=body.style,
        failure_label="outpaint",
    )


@router.post(
    "/projects/{project}/freezone/redraw",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_redraw(
    project: str,
    body: FreezoneRedrawRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：整体重绘或基于遮罩做局部重绘。"""
    return await _start_image_editing(
        project=project,
        user=user,
        operation="redraw",
        source_url=body.source_url,
        image_size=body.image_size,
        model=body.model,
        quality=body.quality,
        requested_aspect_ratio=body.aspect_ratio,
        num_images=body.num_images,
        prompt=body.prompt,
        mask_url=body.mask_url,
        camera=body.camera,
        style=body.style,
        failure_label="masked redraw" if body.mask_url else "redraw",
    )


async def _start_image_editing(
    *,
    project: str,
    user: dict,
    operation: Literal["upscale", "outpaint", "redraw"],
    source_url: str,
    image_size: str,
    model: str,
    quality: str | None,
    requested_aspect_ratio: str,
    num_images: int,
    failure_label: str,
    prompt: str = "",
    mask_url: str | None = None,
    camera: FreezoneImageCameraConfig | None = None,
    style: FreezoneImageStyleConfig | None = None,
):
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_image_editing_use_cases().start(
            StartCreativeCanvasImageEditingCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                operation=operation,
                source_url=source_url,
                image_size=image_size,
                model=model,
                quality=quality,
                requested_aspect_ratio=requested_aspect_ratio,
                prompt=prompt,
                mask_url=mask_url,
                num_images=num_images,
                camera=(
                    CreativeCanvasImageCameraConfig(
                        camera_body=camera.camera_body,
                        lens=camera.lens,
                        focal_length_mm=camera.focal_length_mm,
                        aperture=camera.aperture,
                    )
                    if camera
                    else None
                ),
                style=(
                    CreativeCanvasImageStyleConfig(template_id=style.template_id)
                    if style
                    else None
                ),
            )
        )
    except InvalidCreativeCanvasImageEditingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasImageEditingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasTaskStartFailed as exc:
        logger.warning("failed to start %s task: %s", failure_label, exc, exc_info=True)
        raise HTTPException(503, f"failed to start {failure_label} task: {exc}") from exc

    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "task_episode": result.task_episode,
        "task_scope": result.task_scope,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


__all__ = ["router"]

"""Creative Canvas image endpoints."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.creative_canvas.image_schemas import (
    FreezoneCharacterMultiViewRequest,
    FreezoneEditRequest,
    FreezoneGenRequest,
    FreezoneImageCameraConfig,
    FreezoneImageReversePromptRequest,
    FreezoneImageStyleConfig,
    FreezoneImageTo3GSRequest,
    FreezoneMarkDetectRequest,
    FreezoneOutpaintRequest,
    FreezoneRedrawRequest,
    FreezoneRelightRequest,
    FreezoneStageAssetAcceptedResponse,
    FreezoneTemplateEditRequest,
    FreezoneUpscaleRequest,
)
from ai_anime.api.routes.creative_canvas.job_schemas import (
    FreezoneJobAcceptedResponse,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    CreativeCanvasImageToThreeGsSourceMissing,
    CreativeCanvasImageEditingSourceMissing,
    CreativeCanvasImageGenerationReferenceMissing,
    CreativeCanvasMarkSelection,
    CreativeCanvasReversePromptSourceMissing,
    CreativeCanvasTaskStartFailed,
    InvalidCreativeCanvasReversePromptRequest,
    InvalidCreativeCanvasImageToThreeGsRequest,
    InvalidCreativeCanvasImageEditingRequest,
    InvalidCreativeCanvasImageGenerationRequest,
    InvalidCreativeCanvasImageTemplateMode,
    StartCreativeCanvasReversePromptCommand,
    StartCreativeCanvasImageToThreeGsCommand,
    StartCreativeCanvasImageEditingCommand,
    StartCreativeCanvasImageGenerationCommand,
    StartCreativeCanvasReferenceImageEditingCommand,
    build_image_multi_view_prompt,
    build_image_relight_prompt,
    build_image_template_edit_prompt,
    creative_canvas_image_to_three_gs_use_cases,
    creative_canvas_image_editing_use_cases,
    creative_canvas_image_generation_use_cases,
    StartCreativeCanvasMarkDetectionCommand,
    creative_canvas_long_operation_use_cases,
    creative_canvas_reference_image_editing_use_cases,
    creative_canvas_reverse_prompt_use_cases,
    generation_catalog_queries,
    resolve_image_template_aspect_ratio,
    resolve_image_template_image_size,
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


@router.post(
    "/projects/{project}/freezone/gen",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_gen(
    project: str,
    body: FreezoneGenRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：启动文生图任务，返回可供 SSE 追踪的 task key。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_image_generation_use_cases().start(
            StartCreativeCanvasImageGenerationCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                prompt=body.prompt,
                aspect_ratio=body.aspect_ratio,
                image_size=body.image_size,
                reference_urls=tuple(body.reference_urls or []),
                camera=(
                    CreativeCanvasImageCameraConfig(
                        camera_body=body.camera.camera_body,
                        lens=body.camera.lens,
                        focal_length_mm=body.camera.focal_length_mm,
                        aperture=body.camera.aperture,
                    )
                    if body.camera
                    else None
                ),
                style=(
                    CreativeCanvasImageStyleConfig(template_id=body.style.template_id)
                    if body.style
                    else None
                ),
                model=body.model,
                quality=body.quality,
                extra_params=body.extra_params,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
                model_id=body.model_id or None,
                gen_mode=body.gen_mode or None,
            )
        )
    except InvalidCreativeCanvasImageGenerationRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasImageGenerationReferenceMissing as exc:
        raise HTTPException(404, str(exc)) from exc

    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


@router.post(
    "/projects/{project}/freezone/multi-view",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_multi_view(
    project: str,
    body: FreezoneCharacterMultiViewRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：基于单张源图做多角度重构 / 机位重定位。"""
    return await _start_reference_image_editing(
        project=project,
        user=user,
        prompt=build_image_multi_view_prompt(
            preset=body.preset,
            yaw_degrees=body.yaw_degrees,
            pitch_degrees=body.pitch_degrees,
            shot_size=body.shot_size,
            prompt=body.prompt,
        ),
        base_url=body.source_url,
        extra_reference_urls=(),
        aspect_ratio="original",
        image_size=body.image_size or "original",
        camera=body.camera,
        style=body.style,
        model=body.model,
        quality=body.quality or "medium",
        model_id=body.model_id,
    )


@router.post(
    "/projects/{project}/freezone/relight",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_relight(
    project: str,
    body: FreezoneRelightRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：基于源图和打光参考图重塑光照。"""
    return await _start_reference_image_editing(
        project=project,
        user=user,
        prompt=build_image_relight_prompt(
            has_lighting_reference=bool(body.lighting_reference_url),
            scope=body.scope,
            smart_mode=body.smart_mode,
            brightness=body.brightness,
            color_hex=body.color_hex,
            color_temperature_kelvin=body.color_temperature_kelvin,
            key_light_direction=body.key_light_direction,
            rim_light=body.rim_light,
            prompt=body.prompt,
        ),
        base_url=body.source_url,
        extra_reference_urls=(
            (body.lighting_reference_url,) if body.lighting_reference_url else ()
        ),
        aspect_ratio=body.aspect_ratio,
        image_size=body.image_size or "original",
        camera=None,
        style=None,
        model=body.model,
        quality=body.quality or "medium",
        model_id=body.model_id,
    )


@router.post(
    "/projects/{project}/freezone/template-edit",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_template_edit(
    project: str,
    body: FreezoneTemplateEditRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：九宫格下拉菜单统一编辑接口。"""
    try:
        prompt = build_image_template_edit_prompt(body.mode, body.prompt)
    except InvalidCreativeCanvasImageTemplateMode as exc:
        raise HTTPException(400, str(exc)) from exc
    return await _start_reference_image_editing(
        project=project,
        user=user,
        prompt=prompt,
        base_url=body.source_url,
        extra_reference_urls=(),
        aspect_ratio=resolve_image_template_aspect_ratio(body.mode),
        image_size=body.image_size or resolve_image_template_image_size(body.mode),
        camera=body.camera,
        style=body.style,
        model=body.model,
        quality=body.quality or "medium",
        canvas_id=body.canvas_id or None,
        node_id=body.node_id or None,
        model_id=body.model_id,
    )


@router.post(
    "/projects/{project}/freezone/edit",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_edit(
    project: str,
    body: FreezoneEditRequest,
    user: dict = Depends(get_api_user),
):
    """图片处理：启动图生图 / 图编辑任务，返回 `task_key`。"""
    return await _start_reference_image_editing(
        project=project,
        user=user,
        prompt=body.prompt,
        base_url=body.base_url,
        extra_reference_urls=tuple(body.extra_reference_urls or []),
        aspect_ratio=body.aspect_ratio,
        image_size=body.image_size,
        camera=body.camera,
        style=body.style,
        model=body.model,
        quality=body.quality,
        canvas_id=body.canvas_id or None,
        node_id=body.node_id or None,
        model_id=body.model_id or None,
        gen_mode=body.gen_mode or None,
        extra_params=body.extra_params,
    )


@router.post(
    "/projects/{project}/freezone/marks/detect",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_mark_detect(
    project: str,
    body: FreezoneMarkDetectRequest,
    user: dict = Depends(get_api_user),
):
    """提交图片局部元素标记识别任务。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        receipt = await creative_canvas_long_operation_use_cases().start_mark_detection(
            StartCreativeCanvasMarkDetectionCommand(
                context=resolved.ctx,
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
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {"ok": True, "data": receipt.to_dict()}


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
        model_id=body.model_id,
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
        model_id=body.model_id,
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
        model_id=body.model_id,
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
    model_id: str | None = None,
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
                model_id=model_id,
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


async def _start_reference_image_editing(
    *,
    project: str,
    user: dict,
    prompt: str,
    base_url: str,
    extra_reference_urls: tuple[str, ...],
    aspect_ratio: str,
    image_size: str,
    camera: FreezoneImageCameraConfig | None,
    style: FreezoneImageStyleConfig | None,
    model: str,
    quality: str | None,
    canvas_id: str | None = None,
    node_id: str | None = None,
    model_id: str | None = None,
    gen_mode: str | None = None,
    extra_params: dict[str, object] | None = None,
):
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_reference_image_editing_use_cases().start_reference_edit(
            StartCreativeCanvasReferenceImageEditingCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                prompt=prompt,
                base_url=base_url,
                extra_reference_urls=extra_reference_urls,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
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
                model=model,
                quality=quality,
                canvas_id=canvas_id,
                node_id=node_id,
                model_id=model_id,
                gen_mode=gen_mode,
                extra_params=extra_params,
            )
        )
    except InvalidCreativeCanvasImageEditingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasImageEditingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc

    data = {
        "task_type": result.task_type,
        "job_id": result.job_id,
        "task_key": result.task_key,
        "backend": result.backend,
        "queue": result.queue,
    }
    if result.task_id:
        data["task_id"] = result.task_id
    return {"ok": True, "data": data}


__all__ = ["router"]

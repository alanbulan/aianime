"""Creative Canvas video endpoints."""

import logging
from typing import Awaitable

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.creative_canvas.video_schemas import (
    FreezoneAudioSeparateRequest,
    FreezoneAnalyzeShotsRequest,
    FreezoneAnalyzeVideoStoryRequest,
    FreezoneExtractFramesRequest,
    FreezoneImageToVideoRequest,
    FreezoneKeyframeVideoRequest,
    FreezoneVideoCharacterLibraryItemRequest,
    FreezoneVideoComposeRequest,
    FreezoneVideoEditRequest,
    FreezoneVideoEraseRequest,
    FreezoneVideoGenRequest,
    FreezoneVideoOmniGenRequest,
    FreezoneVideoUpscaleRequest,
)
from ai_anime.api.routes.creative_canvas.job_schemas import (
    FreezoneJobAcceptedResponse,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    AddCreativeCanvasVideoAssetCommand,
    CreativeCanvasVideoAssetMissing,
    CreativeCanvasVideoAssetSourceMissing,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasOmniVideoReference,
    CreativeCanvasVideoCharacterMissing,
    CreativeCanvasVideoCompositionItem,
    CreativeCanvasVideoCompositionTrack,
    CreativeCanvasVideoGenerationOptions,
    CreativeCanvasVideoGenerationResult,
    CreativeCanvasVideoProcessingSourceMissing,
    InvalidCreativeCanvasVideoGenerationRequest,
    InvalidCreativeCanvasVideoAssetRequest,
    InvalidCreativeCanvasVideoProcessingRequest,
    StartCreativeCanvasAudioSeparationCommand,
    StartCreativeCanvasImageVideoCommand,
    StartCreativeCanvasFrameExtractionCommand,
    StartCreativeCanvasKeyframeVideoCommand,
    StartCreativeCanvasOmniVideoCommand,
    StartCreativeCanvasShotAnalysisCommand,
    StartCreativeCanvasTextVideoCommand,
    StartCreativeCanvasVideoEditCommand,
    StartCreativeCanvasVideoCompositionCommand,
    StartCreativeCanvasVideoEraseCommand,
    StartCreativeCanvasVideoUpscaleCommand,
    StartCreativeCanvasVideoStoryAnalysisCommand,
    SyncCreativeCanvasVideoAssetsCommand,
    creative_canvas_video_asset_library_use_cases,
    creative_canvas_video_generation_use_cases,
    creative_canvas_video_processing_use_cases,
    generation_catalog_queries,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)

logger = logging.getLogger("ai_anime.api.freezone")
router = APIRouter()


@router.get(
    "/projects/{project}/freezone/video/camera-templates", tags=["freezone-video"]
)
async def freezone_video_camera_templates(
    project: str,
    user: dict = Depends(get_api_user),
):
    """视频处理：返回文生视频运镜模板库。"""
    await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return {"ok": True, "data": generation_catalog_queries().video_camera_templates()}


@router.get(
    "/projects/{project}/freezone/video/character-library",
    tags=["freezone-video"],
)
async def freezone_video_character_library(
    project: str,
    user: dict = Depends(get_api_user),
):
    """视频处理：获取文生视频角色素材库。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    items = creative_canvas_video_asset_library_use_cases().list_items(
        resolved.project_dir
    )
    return {"ok": True, "data": [dict(item) for item in items]}


@router.post(
    "/projects/{project}/freezone/video/character-library",
    tags=["freezone-video"],
)
async def freezone_add_video_character_library_item(
    project: str,
    body: FreezoneVideoCharacterLibraryItemRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：把上传好的素材登记到资产库（图片/视频/音频）。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        item = creative_canvas_video_asset_library_use_cases().add_item(
            AddCreativeCanvasVideoAssetCommand(
                project_dir=resolved.project_dir,
                name=body.name,
                media=body.media,
                image_urls=tuple(body.image_urls),
                video_url=body.video_url,
                audio_url=body.audio_url,
            )
        )
    except InvalidCreativeCanvasVideoAssetRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoAssetSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "data": dict(item)}


@router.post(
    "/projects/{project}/freezone/video/asset-library/sync-from-mainline",
    tags=["freezone-video"],
)
async def freezone_sync_asset_library_from_mainline(
    project: str,
    user: dict = Depends(get_api_user),
):
    """视频处理：把主线的人物/场景/道具参考图与人物语音幂等同步进资产库。

    走稳定合成 id（``mainline:<kind>:<name>``），重复同步只更新 URL、不产生重复。
    """
    resolved = await _resolve_editor_project(project, user)
    result = await creative_canvas_video_asset_library_use_cases().sync_from_mainline(
        SyncCreativeCanvasVideoAssetsCommand(
            context=resolved.ctx,
            project_dir=resolved.project_dir,
        )
    )
    return {
        "ok": True,
        "data": [dict(item) for item in result.items],
        "synced": result.synced,
    }


@router.delete(
    "/projects/{project}/freezone/video/character-library/{item_id}",
    tags=["freezone-video"],
)
async def freezone_delete_video_character_library_item(
    project: str,
    item_id: str,
    user: dict = Depends(get_api_user),
):
    """视频处理：删除角色素材库条目。"""
    resolved = await _resolve_editor_project(project, user)
    try:
        creative_canvas_video_asset_library_use_cases().delete_item(
            resolved.project_dir,
            item_id,
        )
    except CreativeCanvasVideoAssetMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "data": {"id": item_id, "deleted": True}}


@router.post("/projects/{project}/freezone/video/gen", tags=["freezone-video"])
async def freezone_video_gen(
    project: str,
    body: FreezoneVideoGenRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：文生视频。

    `model` 必填，必须使用当前 Cloud/BYOK 认证模型目录返回的平台 SKU。

    运镜通过模板库和补充提示词控制，角色库通过已上传的人物参考图提供身份一致性。
    """
    resolved = await _resolve_editor_project(project, user)
    return await _start_video_generation(
        creative_canvas_video_generation_use_cases().start_text_video(
            StartCreativeCanvasTextVideoCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                options=_video_generation_options(body),
                character_ids=tuple(body.character_ids),
            )
        ),
        failure_message="failed to start freezone video gen task",
    )


@router.post("/projects/{project}/freezone/video/i2v", tags=["freezone-video"])
async def freezone_video_i2v(
    project: str,
    body: FreezoneImageToVideoRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：图片参考视频。

    统一承接：
    - 单图首帧图生视频
    - 多图图片参考视频
    """
    resolved = await _resolve_editor_project(project, user)
    return await _start_video_generation(
        creative_canvas_video_generation_use_cases().start_image_video(
            StartCreativeCanvasImageVideoCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                options=_video_generation_options(body),
                image_urls=tuple(body.image_urls),
            )
        ),
        failure_message="failed to start freezone image-to-video task",
    )


@router.post("/projects/{project}/freezone/video/keyframes", tags=["freezone-video"])
async def freezone_video_keyframes(
    project: str,
    body: FreezoneKeyframeVideoRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：首尾帧视频。

    接受首帧和尾帧图片；至少需要提供一个。
    """
    resolved = await _resolve_editor_project(project, user)
    return await _start_video_generation(
        creative_canvas_video_generation_use_cases().start_keyframe_video(
            StartCreativeCanvasKeyframeVideoCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                options=_video_generation_options(body),
                first_frame_url=body.first_frame_url,
                last_frame_url=body.last_frame_url,
            )
        ),
        failure_message="failed to start freezone keyframe video task",
    )


@router.post("/projects/{project}/freezone/video/omni-gen", tags=["freezone-video"])
async def freezone_video_omni_gen(
    project: str,
    body: FreezoneVideoOmniGenRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：全能参考文生视频。

    支持文本、图像、视频、音频混合输入，当前默认走 Seedance 2.0。
    """
    resolved = await _resolve_editor_project(project, user)
    return await _start_video_generation(
        creative_canvas_video_generation_use_cases().start_omni_video(
            StartCreativeCanvasOmniVideoCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                options=_video_generation_options(body),
                theme=body.theme,
                references=tuple(
                    CreativeCanvasOmniVideoReference(
                        media_type=item.type,
                        url=item.url,
                        role=item.role,
                    )
                    for item in body.references
                ),
            )
        ),
        failure_message="failed to start freezone omni video gen task",
    )


@router.post("/projects/{project}/freezone/video/video-edit", tags=["freezone-video"])
async def freezone_video_edit(
    project: str,
    body: FreezoneVideoEditRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：视频编辑（HappyHorse 视频编辑功能）。

    输入 1 个源视频 + 0-5 张参考图，走上游 video_url + reference_images。
    """
    resolved = await _resolve_editor_project(project, user)
    return await _start_video_generation(
        creative_canvas_video_generation_use_cases().start_video_edit(
            StartCreativeCanvasVideoEditCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                options=_video_generation_options(body),
                video_url=body.video_url,
                image_urls=tuple(body.image_urls),
                audio_setting=body.audio_setting,
            )
        ),
        failure_message="failed to start freezone video edit task",
    )


@router.post("/projects/{project}/freezone/extract-frames", tags=["freezone-video"])
async def freezone_extract_frames(
    project: str,
    body: FreezoneExtractFramesRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：从视频中抽取关键帧，返回任务 `task_key`。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_video_processing_use_cases().start_frame_extraction(
            StartCreativeCanvasFrameExtractionCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                video_url=body.video_url,
                max_frames=body.max_frames,
                scene_threshold=body.scene_threshold,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return _video_processing_response(result)


@router.post("/projects/{project}/freezone/analyze-shots", tags=["freezone-video"])
async def freezone_analyze_shots(
    project: str,
    body: FreezoneAnalyzeShotsRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：分析一组关键帧的镜头内容，返回任务 `task_key`。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_video_processing_use_cases().start_shot_analysis(
            StartCreativeCanvasShotAnalysisCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                frame_urls=tuple(body.frame_urls),
                analysis_mode=body.analysis_mode,
                duration_sec=body.duration_sec,
                model=body.model,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return _video_processing_response(result)


@router.post(
    "/projects/{project}/freezone/analyze-video-story",
    tags=["freezone-video"],
)
async def freezone_analyze_video_story(
    project: str,
    body: FreezoneAnalyzeVideoStoryRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：抽帧并解析视频故事，返回任务 `task_key`。"""
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_video_processing_use_cases().start_video_story_analysis(
            StartCreativeCanvasVideoStoryAnalysisCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                video_url=body.video_url,
                max_frames=body.max_frames,
                scene_threshold=body.scene_threshold,
                duration_sec=body.duration_sec,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    return _video_processing_response(result)


@router.post(
    "/projects/{project}/freezone/video/upscale",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-video"],
)
async def freezone_video_upscale(
    project: str,
    body: FreezoneVideoUpscaleRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：基础版高清增强。

    当前实现使用 ffmpeg 做传统缩放、轻度降噪和锐化：
    - 保持原始画面比例
    - 按 `resolution` 对长边缩放
    - 保留原视频音轨
    """
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_video_processing_use_cases().start_video_upscale(
            StartCreativeCanvasVideoUpscaleCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                resolution=body.resolution,
                frame_interpolation=body.frame_interpolation,
                denoise_strength=body.denoise_strength,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone video upscale task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone video upscale task: {exc}",
        ) from exc
    return _video_processing_response(result)


@router.post(
    "/projects/{project}/freezone/video/erase",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-video"],
)
async def freezone_video_erase(
    project: str,
    body: FreezoneVideoEraseRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：智能去字幕 / 框选擦除。

    当前为稳定的一期实现：
    - `smart_subtitle`：自动估计底部字幕区域后执行视频擦除
    - `box`：按前端传入的固定框执行区域擦除
    """
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_video_processing_use_cases().start_video_erase(
            StartCreativeCanvasVideoEraseCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                mode=body.mode,
                box_x=body.box_x,
                box_y=body.box_y,
                box_width=body.box_width,
                box_height=body.box_height,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone video erase task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone video erase task: {exc}",
        ) from exc
    return _video_processing_response(result)


@router.post(
    "/projects/{project}/freezone/video/audio-separate",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-video"],
)
async def freezone_audio_separate(
    project: str,
    body: FreezoneAudioSeparateRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：音视频分离。

    当前轻量版会同时产出：
    - 提取出的纯音频
    - 去掉音轨后的无声视频
    """
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_video_processing_use_cases().start_audio_separation(
            StartCreativeCanvasAudioSeparationCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                source_url=body.source_url,
                target_episode=body.target_episode,
                target_beat=body.target_beat,
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone audio separate task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone audio separate task: {exc}",
        ) from exc
    return _video_processing_response(result)


@router.post(
    "/projects/{project}/freezone/video/compose",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-video"],
)
async def freezone_video_compose(
    project: str,
    body: FreezoneVideoComposeRequest,
    user: dict = Depends(get_api_user),
):
    """视频处理：按时间线描述异步导出成片。

    当前为 MVP 版本：
    - 支持顺序视频片段裁剪与拼接
    - 支持时间线空隙自动补黑场
    - 支持附加音频轨混音
    - 暂不支持重叠视频轨、转场和复杂特效
    """
    resolved = await _resolve_editor_project(project, user)
    try:
        result = await creative_canvas_video_processing_use_cases().start_video_composition(
            StartCreativeCanvasVideoCompositionCommand(
                context=resolved.ctx,
                project_dir=resolved.project_dir,
                title=body.title,
                canvas_id=body.canvas_id,
                resolution=body.resolution,
                fps=body.fps,
                background_color=body.background_color,
                keep_original_audio=body.keep_original_audio,
                tracks=tuple(
                    CreativeCanvasVideoCompositionTrack(
                        track_id=track.track_id,
                        kind=track.kind,
                        items=tuple(
                            CreativeCanvasVideoCompositionItem(
                                item_id=item.item_id,
                                source_url=item.source_url,
                                timeline_start=item.timeline_start,
                                source_start=item.source_start,
                                source_end=item.source_end,
                                volume=item.volume,
                                muted=item.muted,
                            )
                            for item in track.items
                        ),
                    )
                    for track in body.tracks
                ),
            )
        )
    except InvalidCreativeCanvasVideoProcessingRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoProcessingSourceMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
        raise
    except RuntimeError as exc:
        logger.warning(
            "failed to start freezone video compose task: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            503,
            f"failed to start freezone video compose task: {exc}",
        ) from exc
    return _video_processing_response(result)


def _video_processing_response(result: CreativeCanvasTaskReceipt) -> dict:
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


async def _resolve_editor_project(project: str, user: dict):
    return await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )


def _video_generation_options(body) -> CreativeCanvasVideoGenerationOptions:
    return CreativeCanvasVideoGenerationOptions(
        prompt=body.prompt,
        camera_template_id=body.camera_template_id,
        marks=tuple(item.model_dump() for item in body.marks),
        aspect_ratio=body.aspect_ratio,
        resolution=body.resolution,
        duration_seconds=body.duration_seconds,
        generate_audio=body.generate_audio,
        human_review=body.human_review,
        scene_optimize=getattr(body, "scene_optimize", None),
        model=body.model,
        model_selector=body.model_id,
        canvas_id=body.canvas_id or None,
        node_id=body.node_id or None,
        gen_mode=body.gen_mode,
    )


async def _start_video_generation(
    start: Awaitable[CreativeCanvasVideoGenerationResult],
    *,
    failure_message: str,
) -> dict:
    try:
        result = await start
    except InvalidCreativeCanvasVideoGenerationRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    except CreativeCanvasVideoCharacterMissing as exc:
        raise HTTPException(404, str(exc)) from exc
    except CreativeCanvasTaskStartFailed as exc:
        logger.warning("%s: %s", failure_message, exc, exc_info=True)
        raise HTTPException(503, f"{failure_message}: {exc}") from exc

    receipt = result.receipt
    response = {
        "ok": True,
        "data": {
            "task_type": receipt.task_type,
            "job_id": receipt.job_id,
            "task_id": receipt.task_id,
            "task_key": receipt.task_key,
            "backend": receipt.backend,
            "queue": receipt.queue,
        },
    }
    if result.meta is not None:
        response["meta"] = result.meta
    return response


__all__ = ["router"]

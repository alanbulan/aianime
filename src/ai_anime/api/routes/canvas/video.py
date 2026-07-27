"""Creative Canvas video endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import (
    FreezoneAnalyzeShotsRequest,
    FreezoneAnalyzeVideoStoryRequest,
    FreezoneExtractFramesRequest,
)
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasVideoProcessingSourceMissing,
    InvalidCreativeCanvasVideoProcessingRequest,
    StartCreativeCanvasFrameExtractionCommand,
    StartCreativeCanvasShotAnalysisCommand,
    StartCreativeCanvasVideoStoryAnalysisCommand,
    creative_canvas_video_processing_use_cases,
    generation_catalog_queries,
)

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


@router.get("/projects/{project}/freezone/video/models", tags=["freezone-video"])
async def freezone_video_models(
    project: str,
    user: dict = Depends(get_api_user),
):
    """视频处理：返回和 AI anime 视频模型下拉一致的可见模型。"""
    await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return {"ok": True, "data": generation_catalog_queries().video_models()}


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


__all__ = ["router"]

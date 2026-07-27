"""Creative Canvas video catalog endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import generation_catalog_queries

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


__all__ = ["router"]

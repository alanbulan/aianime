"""Creative Canvas image catalog endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import generation_catalog_queries

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


__all__ = ["router"]

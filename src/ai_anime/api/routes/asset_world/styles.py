"""风格管理 HTTP 适配器。"""

import logging

import ai_anime.modules.asset_world.public as asset_world
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import ProjectResolution, resolve_project_scope
from ai_anime.api.routes.asset_world.styles_schemas import StylePreviewRequest

logger = logging.getLogger("ai_anime.api.styles")

router = APIRouter()


def _resolved_style_scope(
    resolved: ProjectResolution,
    *,
    request_project: str,
) -> asset_world.StyleScope:
    return asset_world.StyleScope(
        username=resolved.username,
        project_name=resolved.project_name,
        project_dir=resolved.project_dir,
        request_project=request_project,
    )


async def _style_scope(
    project: str | None,
    user: dict,
    *,
    required_role: str = "viewer",
) -> asset_world.StyleScope:
    if not project:
        return asset_world.StyleScope(username=user["username"])
    resolved = await resolve_project_scope(project, user, required_role=required_role)
    return _resolved_style_scope(resolved, request_project=project)


def _error(exc: Exception) -> dict[str, object]:
    return {"ok": False, "error": str(exc)}


def _file_response(style_file: asset_world.StyleFile) -> FileResponse:
    return FileResponse(
        path=str(style_file.path),
        media_type=style_file.media_type,
        filename=style_file.filename,
    )


@router.get("/styles")
async def list_styles(
    project: str | None = Query(None, description="项目名；提供时返回该项目的自定义风格"),
    user: dict = Depends(get_api_user),
):
    """列出所有风格（预设 + 自定义）。"""
    scope = await _style_scope(project, user)
    styles = asset_world.style_catalog_use_cases().list_styles(scope)
    return {"ok": True, "data": styles}


@router.get("/styles/{style_id}")
async def get_style(
    style_id: str,
    project: str | None = Query(None, description="项目名"),
    user: dict = Depends(get_api_user),
):
    """获取风格详情。"""
    scope = await _style_scope(project, user)
    try:
        payload = asset_world.style_catalog_use_cases().get_style(style_id, scope)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": payload}


@router.get("/styles/{style_id}/preview")
async def get_style_preview(
    style_id: str,
    project: str | None = Query(None, description="项目名"),
    user: dict = Depends(get_api_user),
):
    """返回预设或自定义风格的参考预览图。"""
    scope = await _style_scope(project, user)
    try:
        style_file = asset_world.style_catalog_use_cases().get_style_preview(
            style_id,
            scope,
        )
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return _file_response(style_file)


@router.post("/styles")
async def create_style(body: dict, user: dict = Depends(get_api_user)):
    """创建自定义风格。"""
    style_id = body.get("id")
    project = body.get("project")
    if not style_id:
        return {"ok": False, "error": "Style id is required"}
    if not project:
        return {"ok": False, "error": "Project is required"}

    scope = await _style_scope(project, user, required_role="editor")
    command = asset_world.CreateCustomStyleCommand(
        style_id=style_id,
        name=body.get("name"),
        config=body.get("config"),
        preview_path=body.get("preview_path"),
    )
    try:
        asset_world.style_catalog_use_cases().create_custom_style(command, scope)
    except asset_world.InvalidStyleInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": {"id": style_id, "message": "风格已创建"}}


@router.delete("/styles/{style_id}")
async def delete_style(
    style_id: str,
    project: str | None = Query(None, description="项目名"),
    user: dict = Depends(get_api_user),
):
    """删除自定义风格。"""
    use_cases = asset_world.style_catalog_use_cases()
    try:
        use_cases.ensure_custom_style_can_be_deleted(style_id)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    if not project:
        return {"ok": False, "error": "Project is required"}

    scope = await _style_scope(project, user, required_role="editor")
    try:
        use_cases.delete_custom_style(style_id, scope)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": {"id": style_id, "message": "风格已删除"}}


@router.post("/styles/{style_id}/preview")
async def preview_style(
    style_id: str,
    body: StylePreviewRequest,
    user: dict = Depends(get_api_user),
):
    """使用指定风格生成预览图。"""
    scope = await _style_scope(body.project, user)
    try:
        style_file = await asset_world.style_preview_use_cases().generate_preview(
            style_id=style_id,
            scope=scope,
            prompt=body.prompt,
            model=body.model,
        )
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return _file_response(style_file)


@router.post("/projects/{project}/styles/analyze")
async def analyze_style(
    project: str,
    file: UploadFile = File(...),
    style_id: str = Form(""),
    user: dict = Depends(get_api_user),
):
    """上传参考图片，AI 分析并提取风格参数。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    scope = _resolved_style_scope(resolved, request_project=project)
    content = await file.read()
    if not content:
        return {"ok": False, "error": "No file uploaded"}
    billing = (
        asset_world.StyleAnalysisBilling.from_project_context(resolved.ctx)
        if resolved.ctx is not None
        else None
    )
    command = asset_world.AnalyzeStyleCommand(
        content=content,
        mime_type=file.content_type or "image/jpeg",
        filename=file.filename,
        style_id=style_id,
        billing=billing,
    )
    try:
        data = await asset_world.analyze_style().execute(command, scope)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": data}


@router.post("/projects/{project}/styles/preview-upload")
async def upload_style_preview(
    project: str,
    file: UploadFile = File(...),
    style_id: str = Form(...),
    user: dict = Depends(get_api_user),
):
    """立即保存自定义风格参考图，不等待 AI 风格分析。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    scope = _resolved_style_scope(resolved, request_project=project)
    content = await file.read()
    try:
        preview_path = asset_world.style_catalog_use_cases().upload_style_preview(
            scope=scope,
            style_id=style_id,
            content=content,
            filename=file.filename,
            content_type=file.content_type,
        )
    except asset_world.InvalidStyleInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asset_world.UnsupportedStyleMedia as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except asset_world.StyleStorageFailed as exc:
        logger.exception("Failed to persist style preview for %s", style_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True, "data": {"preview_path": preview_path}}

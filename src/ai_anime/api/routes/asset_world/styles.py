"""风格管理 HTTP 适配器。"""

import hashlib
import logging
from pathlib import Path

import ai_anime.modules.asset_world.public as asset_world
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import ProjectResolution, resolve_project_scope
from ai_anime.api.routes.asset_world.styles_schemas import (
    CreateStyleRequest,
    StylePreviewRequest,
    UpdateStyleRequest,
)

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
    user: dict = Depends(get_api_user),
):
    """列出当前账号的所有风格（预设 + 全局自定义）。"""
    scope = asset_world.StyleScope(username=user["username"])
    styles = asset_world.style_catalog_use_cases().list_styles(scope)
    return {"ok": True, "data": styles}


@router.get("/styles/{style_id}")
async def get_style(
    style_id: str,
    user: dict = Depends(get_api_user),
):
    """获取风格详情。"""
    scope = asset_world.StyleScope(username=user["username"])
    try:
        payload = asset_world.style_catalog_use_cases().get_style(style_id, scope)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": payload}


@router.get("/styles/{style_id}/preview")
async def get_style_preview(
    style_id: str,
    user: dict = Depends(get_api_user),
):
    """返回预设或自定义风格的参考预览图。"""
    scope = asset_world.StyleScope(username=user["username"])
    try:
        style_file = asset_world.style_catalog_use_cases().get_style_preview(
            style_id,
            scope,
        )
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return _file_response(style_file)


@router.post("/styles")
async def create_style(body: CreateStyleRequest, user: dict = Depends(get_api_user)):
    """创建当前账号的全局自定义风格。"""
    config = body.config.model_dump(exclude_none=True, exclude_unset=True)
    scope = asset_world.StyleScope(username=user["username"])
    command = asset_world.CreateCustomStyleCommand(
        style_id=body.id or "",
        name=body.name,
        config=config,
        preview_path=body.preview_path,
    )
    try:
        style_id = asset_world.style_catalog_use_cases().create_custom_style(
            command,
            scope,
        )
    except asset_world.StyleAlreadyExists as exc:
        return {
            "ok": False,
            "error": "style_already_exists",
            "message": str(exc),
        }
    except asset_world.InvalidStyleInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": {"id": style_id, "message": "风格已创建"}}


@router.put("/styles/{style_id}")
async def update_style(
    style_id: str,
    body: UpdateStyleRequest,
    user: dict = Depends(get_api_user),
):
    """更新当前账号中已存在的全局自定义风格。"""
    scope = asset_world.StyleScope(username=user["username"])
    command = asset_world.UpdateCustomStyleCommand(
        style_id=style_id,
        name=body.name.strip(),
        config=body.config.model_dump(exclude_none=True),
    )
    try:
        updated_id = asset_world.style_catalog_use_cases().update_custom_style(
            command,
            scope,
        )
    except asset_world.InvalidStyleInput as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": {"id": updated_id, "message": "风格已更新"}}


@router.delete("/styles/{style_id}")
async def delete_style(
    style_id: str,
    user: dict = Depends(get_api_user),
):
    """删除自定义风格。"""
    use_cases = asset_world.style_catalog_use_cases()
    try:
        use_cases.ensure_custom_style_can_be_deleted(style_id)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    scope = asset_world.StyleScope(username=user["username"])
    try:
        use_cases.delete_custom_style(style_id, scope)
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, "data": {"id": style_id, "message": "风格已删除"}}


@router.post("/styles/{style_id}/preview")
async def generate_style_preview(
    style_id: str,
    body: StylePreviewRequest,
    user: dict = Depends(get_api_user),
):
    """将自定义风格参考图生成提交到项目任务中心。"""
    project = (body.project or "").strip()
    if not project:
        return {"ok": False, "error": "Project is required"}
    resolved = await resolve_project_scope(project, user, required_role="editor")
    scope = _resolved_style_scope(resolved, request_project=project)
    try:
        scheduled = await asset_world.style_preview_task_use_cases().schedule_preview(
            task_context=resolved.ctx,
            style_id=style_id,
            scope=scope,
            prompt=body.prompt,
        )
    except asset_world.StyleRejected as exc:
        return _error(exc)
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/styles/analyze")
async def analyze_style(
    project: str,
    file: UploadFile = File(...),
    style_id: str = Form(""),
    user: dict = Depends(get_api_user),
):
    """上传参考图片，AI 分析并提取风格参数。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    content = await file.read()
    if not content:
        return {"ok": False, "error": "No file uploaded"}
    digest = hashlib.sha256(content).hexdigest()
    suffix = Path(file.filename or "style.jpg").suffix.lower() or ".jpg"
    staged_dir = resolved.project_dir / ".task_inputs" / "style_analysis"
    staged_dir.mkdir(parents=True, exist_ok=True)
    staged_path = staged_dir / f"{digest}{suffix}"
    staged_path.write_bytes(content)
    task_scope = f"style_analysis__{digest[:12]}"
    try:
        scheduled = await asset_world.style_preview_task_use_cases().schedule_analysis(
            task_context=resolved.ctx,
            source_path=staged_path,
            mime_type=file.content_type or "image/jpeg",
            filename=file.filename or staged_path.name,
            style_id=style_id,
            scope=task_scope,
        )
    except asset_world.StyleRejected as exc:
        staged_path.unlink(missing_ok=True)
        return _error(exc)
    except Exception:
        staged_path.unlink(missing_ok=True)
        raise
    return {"ok": True, **scheduled.as_dict()}


@router.put("/styles/{style_id}/preview")
async def upload_style_preview(
    style_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_api_user),
):
    """立即保存账号级自定义风格参考图，不等待 AI 风格分析。"""
    scope = asset_world.StyleScope(username=user["username"])
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

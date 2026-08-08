"""Production settings and image-generation guard endpoints."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.production.settings_schemas import (
    OperatorPasswordVerifyRequest,
    RenderSettingsUpdate,
    SketchRegenQueueUpdate,
    SketchSettingsUpdate,
)
from ai_anime.modules.production.public import (
    ImageGenerationGuardQuery,
    ProductionImageSettingsRejected,
    ReplaceSketchRegenQueueCommand,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
    image_generation_usage_use_cases,
    production_image_settings_use_cases,
    sketch_regen_queue_use_cases,
)

router = APIRouter()


@router.get("/projects/{project}/render-settings")
async def get_render_settings(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return Render-stage image model and sizing settings for React."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": production_image_settings_use_cases().render_settings(
            resolved.username,
            resolved.project_name,
        ),
    }


@router.patch("/projects/{project}/render-settings")
async def update_render_settings(
    project: str,
    body: RenderSettingsUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist Render-stage image model and sizing settings."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        data = production_image_settings_use_cases().update_render_settings(
            resolved.username,
            resolved.project_name,
            UpdateRenderImageSettingsCommand(
                render_image_selection=body.render_image_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except ProductionImageSettingsRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/sketch-settings")
async def get_sketch_settings(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return Sketch-stage image model settings for React."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": production_image_settings_use_cases().sketch_settings(
            resolved.username,
            resolved.project_name,
        ),
    }


@router.patch("/projects/{project}/sketch-settings")
async def update_sketch_settings(
    project: str,
    body: SketchSettingsUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist Sketch-stage image model settings."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        data = production_image_settings_use_cases().update_sketch_settings(
            resolved.username,
            resolved.project_name,
            UpdateSketchImageSettingsCommand(
                sketch_image_selection=body.sketch_image_selection,
            ),
        )
    except ProductionImageSettingsRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, "data": data}


@router.get("/projects/{project}/episodes/{episode_num}/sketch-regen-queue")
async def get_sketch_regen_queue(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return the persisted React sketch regeneration dispatch queue."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    return {
        "ok": True,
        "data": sketch_regen_queue_use_cases()
        .get(
            resolved.username,
            resolved.project_name,
            episode_num,
        )
        .as_dict(),
    }


@router.put("/projects/{project}/episodes/{episode_num}/sketch-regen-queue")
async def update_sketch_regen_queue(
    project: str,
    episode_num: int,
    body: SketchRegenQueueUpdate,
    user: dict = Depends(get_api_user),
):
    """Persist the React sketch regeneration dispatch queue per episode."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    result = sketch_regen_queue_use_cases().replace(
        resolved.username,
        resolved.project_name,
        ReplaceSketchRegenQueueCommand(
            episode_num=episode_num,
            items=[item.model_dump() for item in body.items],
        ),
    )
    return {
        "ok": True,
        "data": result.as_dict(),
    }


@router.get("/projects/{project}/episodes/{episode_num}/sketch-image-usage")
async def get_sketch_image_usage(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
):
    """Return NiceGUI-style Sketch image request usage summary."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    summary = image_generation_usage_use_cases().sketch_usage(
        resolved.project_dir,
        episode_num,
    )
    return {"ok": True, "data": summary}


@router.get("/projects/{project}/episodes/{episode_num}/image-generation-guard")
async def get_image_generation_guard(
    project: str,
    episode_num: int,
    task_type: str = Query(...),
    scope: str = Query(...),
    subject: str = Query("当前生成任务"),
    user: dict = Depends(get_api_user),
):
    """Return per-scope image generation guard status used before dispatch."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    guard = image_generation_usage_use_cases().guard(
        ImageGenerationGuardQuery(
            project_dir=resolved.project_dir,
            episode_num=episode_num,
            task_type=task_type,
            scope=scope,
            subject=subject,
        )
    )
    return {"ok": True, "data": guard.as_dict()}


@router.post(
    "/projects/{project}/episodes/{episode_num}/image-generation-guard/verify-password"
)
async def verify_image_generation_guard_password(
    project: str,
    episode_num: int,
    body: OperatorPasswordVerifyRequest,
    user: dict = Depends(get_api_user),
):
    """Verify the operator password required after repeated image attempts."""
    verified = image_generation_usage_use_cases().verify_operator_password(
        body.password,
    )
    return {
        "ok": True,
        "data": {"verified": verified},
    }


__all__ = ["router"]

"""Production render planning endpoints."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.production_render_schemas import (
    BeatsRegenerateRequest,
    GridRegenerateRequest,
    RenderPlanExecuteRequest,
    RenderPlanRequest,
    SketchRegenerateRequest,
)
from ai_anime.modules.production.public import (
    BuildRenderPlanCommand,
    ExecuteRenderPlanCommand,
    GridRegenerationRejected,
    RegenerateGridCommand,
    RegenerateSelectedBeatsCommand,
    RenderPlanConflict,
    RenderPlanFeatureDisabled,
    RenderPlanGrid,
    RenderPlanRejected,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    grid_regeneration_use_cases,
    render_plan_use_cases,
    selected_regeneration_use_cases,
)

router = APIRouter()


def _render_plan_unavailable_response(use_cases: Any) -> JSONResponse | None:
    try:
        use_cases.ensure_available()
    except RenderPlanFeatureDisabled as exc:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "feature_disabled",
                "data": {"reason": str(exc)},
            },
        )
    return None


def _render_plan_rejection_response(exc: RenderPlanRejected) -> JSONResponse:
    return JSONResponse(
        status_code=409 if isinstance(exc, RenderPlanConflict) else 400,
        content=exc.as_dict(),
    )


@router.post("/projects/{project}/episodes/{episode_num}/grids/{grid_index}/regenerate")
async def regenerate_grid(
    project: str,
    episode_num: int,
    grid_index: int,
    body: GridRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """Regenerate one Render grid."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await grid_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateGridCommand(
                episode_num=episode_num,
                grid_index=grid_index,
                style=body.style,
                scene_grouping=body.scene_grouping,
                character_grouping=body.character_grouping,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except GridRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/beats/regenerate")
async def regenerate_beats(
    project: str,
    episode_num: int,
    body: BeatsRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """Regenerate Render images for selected Beats."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await selected_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateSelectedBeatsCommand(
                kind=SelectedRegenerationKind.RENDER,
                episode_num=episode_num,
                beat_indices=tuple(body.beat_indices),
                style=body.style,
                mode_key=body.mode_key,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except SelectedRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/sketches/regenerate")
async def regenerate_sketches(
    project: str,
    episode_num: int,
    body: SketchRegenerateRequest,
    user: dict = Depends(get_api_user),
):
    """Regenerate sketches for selected Beats."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await selected_regeneration_use_cases().regenerate(
            resolved.ctx,
            RegenerateSelectedBeatsCommand(
                kind=SelectedRegenerationKind.SKETCH,
                episode_num=episode_num,
                beat_indices=tuple(body.beat_indices),
                style=body.style,
                mode_key=body.mode_key,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except SelectedRegenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/render/plan")
async def render_plan(
    project: str,
    episode_num: int,
    body: RenderPlanRequest,
    user: dict = Depends(get_api_user),
):
    """Return the server-authoritative render plan for selected Beats."""
    use_cases = render_plan_use_cases()
    unavailable = _render_plan_unavailable_response(use_cases)
    if unavailable is not None:
        return unavailable
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        planned = await use_cases.plan(
            resolved.ctx,
            BuildRenderPlanCommand(
                episode_num=episode_num,
                beat_numbers=tuple(body.beat_indices),
                strategy=body.strategy,
                aspect_mode=body.aspect_mode,
                force_one_by_one=body.force_one_by_one,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except RenderPlanRejected as exc:
        return _render_plan_rejection_response(exc)
    return {"ok": True, "data": planned.as_dict()}


@router.post("/projects/{project}/episodes/{episode_num}/render/execute")
async def render_execute(
    project: str,
    episode_num: int,
    body: RenderPlanExecuteRequest,
    user: dict = Depends(get_api_user),
):
    """Validate and dispatch a server-authoritative render plan."""
    use_cases = render_plan_use_cases()
    unavailable = _render_plan_unavailable_response(use_cases)
    if unavailable is not None:
        return unavailable
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        executed = await use_cases.execute(
            resolved.ctx,
            ExecuteRenderPlanCommand(
                episode_num=episode_num,
                plan=tuple(
                    RenderPlanGrid(
                        mode_key=entry.mode_key,
                        rows=entry.rows,
                        cols=entry.cols,
                        beat_numbers=tuple(entry.beat_numbers),
                        location=entry.location,
                        padding_count=entry.padding_count,
                        reasons=tuple(entry.reasons),
                        warnings=tuple(entry.warnings),
                    )
                    for entry in body.plan
                ),
                plan_hash=body.plan_hash,
                input_fingerprint=body.input_fingerprint,
                strategy=body.strategy,
                aspect_mode=body.aspect_mode,
                beat_numbers=tuple(body.beat_indices),
                force_one_by_one=body.force_one_by_one,
                custom_plan=body.custom_plan,
                image_generation_selection=body.image_generation_selection,
                sketch_aspect_padding=body.sketch_aspect_padding,
            ),
        )
    except RenderPlanRejected as exc:
        return _render_plan_rejection_response(exc)
    return {"ok": True, "data": executed.as_dict()}


__all__ = ["router"]

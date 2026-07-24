"""Production render planning endpoints."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import RenderPlanExecuteRequest, RenderPlanRequest
from ai_anime.modules.production.public import (
    BuildRenderPlanCommand,
    ExecuteRenderPlanCommand,
    RenderPlanConflict,
    RenderPlanFeatureDisabled,
    RenderPlanGrid,
    RenderPlanRejected,
    render_plan_use_cases,
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

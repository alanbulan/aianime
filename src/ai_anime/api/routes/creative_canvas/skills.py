"""Creative Canvas skill catalog HTTP adapters."""

from fastapi import APIRouter, Body, Depends, HTTPException

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.creative_canvas.job_schemas import (
    FreezoneJobAcceptedResponse,
)
from ai_anime.api.routes.creative_canvas.skills_schemas import (
    FreezoneFrameFromContextRequest,
    FreezoneScene360Request,
    FreezoneSketchFromContextRequest,
)
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasMainlineBeatMissing,
    CreativeCanvasMainlineMediaMissing,
    CreativeCanvasStagingPropRejected,
    CreativeCanvasSkillRunRejected,
    GenerateCreativeCanvasStagingPropCommand,
    GenerateCreativeCanvasFrameFromContextCommand,
    GenerateCreativeCanvasScene360Command,
    GenerateCreativeCanvasSketchFromContextCommand,
    GetCreativeCanvasSkillRunResultQuery,
    InvalidCreativeCanvasMainlineGeneration,
    RunCreativeCanvasSkillCommand,
    SkillRunRequest,
    SkillRunResponse,
    SkillRunResult,
    canvas_event_actor,
    creative_canvas_mainline_generation_use_cases,
    creative_canvas_skill_catalog_queries,
    creative_canvas_skill_run_use_cases,
    creative_canvas_staging_prop_use_cases,
)

router = APIRouter()

TAG_FREEZONE_SKILLS = "freezone-skills"

_SKILL_RUN_HTTP_STATUS = {
    "bad_request": 400,
    "not_found": 404,
    "conflict": 409,
    "validation": 422,
    "runtime": 500,
    "unsupported": 501,
}


def _mainline_job_response(receipt) -> dict:
    return {"ok": True, "data": receipt.to_dict()}


def _raise_mainline_generation_error(exc: Exception) -> None:
    if isinstance(exc, InvalidCreativeCanvasMainlineGeneration):
        raise HTTPException(400, str(exc)) from exc
    if isinstance(
        exc,
        (CreativeCanvasMainlineBeatMissing, CreativeCanvasMainlineMediaMissing),
    ):
        raise HTTPException(404, str(exc)) from exc
    raise exc


def _raise_skill_run_error(exc: CreativeCanvasSkillRunRejected) -> None:
    raise HTTPException(
        status_code=_SKILL_RUN_HTTP_STATUS[exc.kind],
        detail=exc.detail,
    ) from exc


@router.get("/freezone/skills", tags=["freezone-skills"])
async def freezone_skills(user: dict = Depends(get_api_user)):
    skills = creative_canvas_skill_catalog_queries().list_skills()
    return {"ok": True, "data": [skill.model_dump(mode="json") for skill in skills]}


@router.post(
    "/projects/{project}/freezone/ai-staging-prop",
    tags=["freezone-skills"],
)
async def freezone_ai_staging_prop(
    project: str,
    request: dict[str, object] = Body(default_factory=dict),
    user: dict = Depends(get_api_user),
):
    await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        result = await creative_canvas_staging_prop_use_cases().generate(
            GenerateCreativeCanvasStagingPropCommand(request=request)
        )
    except CreativeCanvasStagingPropRejected as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "data": result}


@router.post(
    "/projects/{project}/freezone/sketch-from-context",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_sketch_from_context(
    project: str,
    body: FreezoneSketchFromContextRequest,
    user: dict = Depends(get_api_user),
):
    scope = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        receipt = await creative_canvas_mainline_generation_use_cases().generate_sketch_from_context(
            GenerateCreativeCanvasSketchFromContextCommand(
                context=scope.ctx,
                project_dir=scope.project_dir,
                episode=body.episode,
                beat=body.beat,
                source_kind=body.source_kind,
                source_url=body.source_url,
                aspect_ratio=body.aspect_ratio,
                model=body.model,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except (
        InvalidCreativeCanvasMainlineGeneration,
        CreativeCanvasMainlineBeatMissing,
        CreativeCanvasMainlineMediaMissing,
    ) as exc:
        _raise_mainline_generation_error(exc)
    return _mainline_job_response(receipt)


@router.post(
    "/projects/{project}/freezone/frame-from-context",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_frame_from_context(
    project: str,
    body: FreezoneFrameFromContextRequest,
    user: dict = Depends(get_api_user),
):
    scope = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        receipt = await creative_canvas_mainline_generation_use_cases().generate_frame_from_context(
            GenerateCreativeCanvasFrameFromContextCommand(
                context=scope.ctx,
                project_dir=scope.project_dir,
                episode=body.episode,
                beat=body.beat,
                sketch_url=body.sketch_url,
                background_url=body.background_url,
                identity_urls=tuple(body.identity_urls),
                prop_urls=tuple(body.prop_urls),
                aspect_ratio=body.aspect_ratio,
                quality=body.quality,
                model=body.model,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except (
        InvalidCreativeCanvasMainlineGeneration,
        CreativeCanvasMainlineBeatMissing,
        CreativeCanvasMainlineMediaMissing,
    ) as exc:
        _raise_mainline_generation_error(exc)
    return _mainline_job_response(receipt)


@router.post(
    "/projects/{project}/freezone/scene-360",
    response_model=FreezoneJobAcceptedResponse,
    tags=["freezone-image"],
)
async def freezone_scene_360(
    project: str,
    body: FreezoneScene360Request,
    user: dict = Depends(get_api_user),
):
    scope = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        receipt = await creative_canvas_mainline_generation_use_cases().generate_scene_360(
            GenerateCreativeCanvasScene360Command(
                context=scope.ctx,
                project_dir=scope.project_dir,
                reference_url=body.reference_url,
                reverse_reference_url=body.reverse_reference_url,
                mode=body.mode,
                model=body.model,
                quality=body.quality,
                canvas_id=body.canvas_id or None,
                node_id=body.node_id or None,
            )
        )
    except (
        InvalidCreativeCanvasMainlineGeneration,
        CreativeCanvasMainlineBeatMissing,
        CreativeCanvasMainlineMediaMissing,
    ) as exc:
        _raise_mainline_generation_error(exc)
    return _mainline_job_response(receipt)


@router.post(
    "/projects/{project}/freezone/skills/{skill_id}/run",
    response_model=SkillRunResponse,
    tags=[TAG_FREEZONE_SKILLS],
)
async def freezone_skill_run(
    project: str,
    skill_id: str,
    body: SkillRunRequest,
    user: dict = Depends(get_api_user),
):
    scope = await resolve_project_scope(
        project,
        user,
        required_role="editor",
        operation="access freezone project files",
    )
    try:
        return await creative_canvas_skill_run_use_cases().run(
            RunCreativeCanvasSkillCommand(
                context=scope.ctx,
                project_id=project,
                project_dir=scope.project_dir,
                skill_id=skill_id,
                request=body,
                actor=canvas_event_actor(user),
            )
        )
    except CreativeCanvasSkillRunRejected as exc:
        _raise_skill_run_error(exc)


@router.get(
    "/projects/{project}/freezone/skills/runs/{run_id}/result",
    response_model=SkillRunResult,
    tags=[TAG_FREEZONE_SKILLS],
)
async def freezone_skill_run_result(
    project: str,
    run_id: str,
    user: dict = Depends(get_api_user),
):
    scope = await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    try:
        return await creative_canvas_skill_run_use_cases().result(
            GetCreativeCanvasSkillRunResultQuery(
                context=scope.ctx,
                project_id=project,
                project_dir=scope.project_dir,
                run_id=run_id,
                actor=canvas_event_actor(user),
            )
        )
    except CreativeCanvasSkillRunRejected as exc:
        _raise_skill_run_error(exc)

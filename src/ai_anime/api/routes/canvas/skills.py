"""Creative Canvas skill catalog HTTP adapters."""

from fastapi import APIRouter, Body, Depends, HTTPException

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasStagingPropRejected,
    GenerateCreativeCanvasStagingPropCommand,
    creative_canvas_skill_catalog_queries,
    creative_canvas_staging_prop_use_cases,
)

router = APIRouter()


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

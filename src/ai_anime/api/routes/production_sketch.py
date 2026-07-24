"""Production sketch generation endpoints."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import require_scope
from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.schemas import SketchGenerateRequest
from ai_anime.modules.production.public import (
    GenerateSketchesCommand,
    SketchGenerationRejected,
    sketch_generation_use_cases,
)

router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/sketches/generate")
async def generate_sketches(
    project: str,
    episode_num: int,
    body: SketchGenerateRequest,
    user: dict = Depends(require_scope("tasks:submit")),
):
    """Queue sketch grid generation for an episode."""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    try:
        scheduled = await sketch_generation_use_cases().generate(
            resolved.ctx,
            GenerateSketchesCommand(
                episode_num=episode_num,
                grid_index=body.grid_index,
                style=body.style,
                model=body.model,
                sketch_scene_grouping=body.sketch_scene_grouping,
                aspect_ratio=body.aspect_ratio,
                image_generation_selection=body.image_generation_selection,
            ),
        )
    except SketchGenerationRejected as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, **scheduled.as_dict()}


__all__ = ["router"]

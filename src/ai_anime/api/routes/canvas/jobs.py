"""Creative Canvas asynchronous job result HTTP adapters."""

from fastapi import APIRouter, Depends

from ai_anime.api.auth import get_api_user
from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.creative_canvas.public import (
    CreativeCanvasJobType,
    GetCreativeCanvasJobResultQuery,
    creative_canvas_job_result_queries,
)

router = APIRouter()


@router.get(
    "/projects/{project}/freezone/jobs/{task_type}/{job_id}/result",
    tags=["freezone-jobs"],
)
async def freezone_job_result(
    project: str,
    task_type: CreativeCanvasJobType,
    job_id: str,
    user: dict = Depends(get_api_user),
):
    resolved = await resolve_project_scope(
        project,
        user,
        required_role="viewer",
        operation="access freezone project files",
    )
    return creative_canvas_job_result_queries().get_result(
        GetCreativeCanvasJobResultQuery(
            context=resolved.ctx,
            project_dir=resolved.project_dir,
            task_type=task_type,
            job_id=job_id,
        )
    )

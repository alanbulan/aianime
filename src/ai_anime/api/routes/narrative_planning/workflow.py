"""Task-center entry point for the complete script production graph."""

from fastapi import APIRouter, Depends

from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.narrative_planning.workflow_schemas import (
    ScriptWorkflowRequest,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    project_task_submission_use_cases,
    task_config_scope,
)

router = APIRouter()


@router.post("/projects/{project}/workflow/scripts")
async def start_script_workflow(
    project: str,
    body: ScriptWorkflowRequest,
    user: dict = Depends(get_api_user),
):
    """Run one stage or every missing prerequisite through the same DAG."""

    resolved = await resolve_project_scope(project, user, required_role="editor")
    payload = body.model_dump()
    payload["episodes"] = list(dict.fromkeys(payload["episodes"]))
    scope = task_config_scope("script_workflow", payload)
    receipt = await project_task_submission_use_cases().submit(
        resolved.ctx,
        ProjectTaskSubmission(
            task_type="script_workflow",
            queue_kind="workflow",
            scope=scope,
            payload=payload,
        ),
    )
    return {
        "ok": True,
        "task_type": "script_workflow",
        "task_id": receipt.task_id,
        "task_key": receipt.task_key,
        "backend": receipt.backend,
        "queue": receipt.queue,
        "scope": scope,
        "message": "脚本生产图已进入任务中心",
    }


__all__ = ["router", "start_script_workflow"]

"""Canonical end-to-end production workflow HTTP entry point."""

from fastapi import APIRouter, Depends

from ai_anime.api.deps import resolve_project_scope
from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.routes.production.workflow_schemas import (
    ProductionWorkflowRequest,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    project_task_submission_use_cases,
    task_config_scope,
)

router = APIRouter()


@router.post("/projects/{project}/workflow/production")
async def start_production_workflow(
    project: str,
    body: ProductionWorkflowRequest,
    user: dict = Depends(get_api_user),
):
    """Resume every missing stage through final episode composition."""

    resolved = await resolve_project_scope(project, user, required_role="editor")
    payload = body.model_dump()
    payload["episodes"] = list(dict.fromkeys(payload["episodes"]))
    scope = task_config_scope("production_workflow", payload)
    receipt = await project_task_submission_use_cases().submit(
        resolved.ctx,
        ProjectTaskSubmission(
            task_type="production_workflow",
            queue_kind="workflow",
            scope=scope,
            payload=payload,
        ),
    )
    return {
        "ok": True,
        "task_type": "production_workflow",
        "task_id": receipt.task_id,
        "task_key": receipt.task_key,
        "backend": receipt.backend,
        "queue": receipt.queue,
        "scope": scope,
        "message": "完整生产工作流已进入任务中心",
    }


__all__ = ["router", "start_production_workflow"]

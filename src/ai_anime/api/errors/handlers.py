"""Map application errors to stable HTTP responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from ai_anime.modules.project_workspace.public import (
    InvalidProjectName,
    ProjectAlreadyExists,
    ProjectBackendNotInitialized,
    ProjectHomeNodeRequired,
    ProjectLifecycleConflict,
    ProjectNotFound,
    ProjectRoleRequired,
    ProjectUserIdentityUnresolved,
)
from ai_anime.shared.billing_errors import (
    BILLING_RULE_NOT_CONFIGURED_MESSAGE,
    INSUFFICIENT_CREDITS_MESSAGE,
    BillingRuleNotConfiguredError,
    InsufficientCreditsError,
    billing_rule_not_configured_payload,
    insufficient_credits_payload,
)
from ai_anime.task_backend.limits import (
    GlobalLaneQueueLimitExceeded,
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)


async def project_backend_not_initialized(
    request: Request,
    exc: ProjectBackendNotInitialized,
) -> JSONResponse:
    _ = request, exc
    return JSONResponse(
        status_code=503,
        content={"detail": "project backend not initialised"},
    )


async def project_not_found(
    request: Request,
    exc: ProjectNotFound,
) -> JSONResponse:
    _ = request, exc
    return JSONResponse(status_code=404, content={"detail": "Project not found"})


async def project_user_identity_unresolved(
    request: Request,
    exc: ProjectUserIdentityUnresolved,
) -> JSONResponse:
    _ = request, exc
    return JSONResponse(
        status_code=401,
        content={"detail": "Unable to resolve user id"},
    )


async def project_role_required(
    request: Request,
    exc: ProjectRoleRequired,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=403,
        content={"detail": f"project role required: {exc.required}"},
    )


async def project_home_node_required(
    request: Request,
    exc: ProjectHomeNodeRequired,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=409,
        content={
            "detail": {
                "code": "project_not_on_this_node",
                "message": f"{exc.operation} must run on the project home node",
                "project_id": exc.project_id,
                "home_node_id": exc.home_node_id,
            }
        },
    )


async def invalid_project_name(
    request: Request,
    exc: InvalidProjectName,
) -> JSONResponse:
    _ = request
    return JSONResponse(status_code=400, content={"detail": str(exc)})


async def project_already_exists(
    request: Request,
    exc: ProjectAlreadyExists,
) -> JSONResponse:
    _ = request
    return JSONResponse(status_code=409, content={"detail": str(exc)})


async def project_lifecycle_conflict(
    request: Request,
    exc: ProjectLifecycleConflict,
) -> JSONResponse:
    _ = request
    return JSONResponse(status_code=400, content={"detail": str(exc)})


async def project_task_limit_exceeded(
    request: Request,
    exc: ProjectTaskLimitExceeded,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=429,
        content={
            "ok": False,
            "error": f"当前项目 {exc.queue_kind} 队列任务已满，请等待已有任务完成后再提交",
            "data": {
                "project_id": exc.project_id,
                "queue_kind": exc.queue_kind,
                "limit": exc.limit,
                "active": exc.active,
                "limit_scope": "project",
            },
        },
    )


async def project_user_task_limit_exceeded(
    request: Request,
    exc: ProjectUserTaskLimitExceeded,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=429,
        content={
            "ok": False,
            "error": (
                f"你在当前项目 {exc.queue_kind} 队列任务已满，"
                "请等待自己的任务完成后再提交"
            ),
            "data": {
                "project_id": exc.project_id,
                "requester_user_id": exc.requester_user_id,
                "queue_kind": exc.queue_kind,
                "limit": exc.limit,
                "active": exc.active,
                "limit_scope": "user",
            },
        },
    )


async def global_lane_queue_limit_exceeded(
    request: Request,
    exc: GlobalLaneQueueLimitExceeded,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=429,
        content={
            "ok": False,
            "error": f"当前节点 {exc.queue_kind} 队列已满，请稍后再提交",
            "data": {
                "project_id": exc.project_id,
                "queue_kind": exc.queue_kind,
                "limit": exc.limit,
                "queued": exc.queued,
                "limit_scope": "global_lane_queue",
            },
        },
    )


async def insufficient_credits(
    request: Request,
    exc: InsufficientCreditsError,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=402,
        content={
            "ok": False,
            "error": INSUFFICIENT_CREDITS_MESSAGE,
            "data": insufficient_credits_payload(exc),
        },
    )


async def billing_rule_not_configured(
    request: Request,
    exc: BillingRuleNotConfiguredError,
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=409,
        content={
            "ok": False,
            "error": BILLING_RULE_NOT_CONFIGURED_MESSAGE,
            "data": billing_rule_not_configured_payload(exc),
        },
    )


def register_exception_handlers(application: FastAPI) -> None:
    application.add_exception_handler(
        ProjectBackendNotInitialized,
        project_backend_not_initialized,
    )
    application.add_exception_handler(ProjectNotFound, project_not_found)
    application.add_exception_handler(
        ProjectUserIdentityUnresolved,
        project_user_identity_unresolved,
    )
    application.add_exception_handler(ProjectRoleRequired, project_role_required)
    application.add_exception_handler(
        ProjectHomeNodeRequired,
        project_home_node_required,
    )
    application.add_exception_handler(InvalidProjectName, invalid_project_name)
    application.add_exception_handler(ProjectAlreadyExists, project_already_exists)
    application.add_exception_handler(
        ProjectLifecycleConflict,
        project_lifecycle_conflict,
    )
    application.add_exception_handler(
        ProjectTaskLimitExceeded,
        project_task_limit_exceeded,
    )
    application.add_exception_handler(
        ProjectUserTaskLimitExceeded,
        project_user_task_limit_exceeded,
    )
    application.add_exception_handler(
        GlobalLaneQueueLimitExceeded,
        global_lane_queue_limit_exceeded,
    )
    application.add_exception_handler(
        InsufficientCreditsError,
        insufficient_credits,
    )
    application.add_exception_handler(
        BillingRuleNotConfiguredError,
        billing_rule_not_configured,
    )

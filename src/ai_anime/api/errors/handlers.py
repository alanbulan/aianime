"""Map application errors to stable HTTP responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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

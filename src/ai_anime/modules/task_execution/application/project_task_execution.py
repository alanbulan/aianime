"""Backend-neutral project task execution orchestration."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import AbstractContextManager
from typing import Any

from ai_anime.modules.model_usage.public import (
    MODEL_QUOTA_EXCEEDED_MESSAGE,
    is_model_quota_error,
    model_quota_payload,
)
from ai_anime.modules.task_execution.application.ports import ProjectTaskRunner
from ai_anime.modules.task_execution.domain.task_cancellation import (
    TaskCancelled,
    TaskTimedOut,
)
from ai_anime.modules.task_execution.domain.task_execution import (
    completion_metadata_with_provider_task_id,
)

logger = logging.getLogger(__name__)

CancellationCheck = Callable[..., Awaitable[bool]]
ContextFactory = Callable[..., AbstractContextManager[Any]]
RunnerLoader = Callable[[], None]
RunnerResolver = Callable[[str], ProjectTaskRunner | None]


def project_task_failure_for_exception(
    exc: BaseException,
    *,
    timeout_seconds: int = 30 * 60,
) -> tuple[str, dict[str, Any], bool]:
    if isinstance(exc, TaskTimedOut):
        effective_timeout = int(
            getattr(exc, "timeout_seconds", None) or timeout_seconds
        )
        timeout_minutes = max(round(effective_timeout / 60), 1)
        return (
            f"任务超过 {timeout_minutes} 分钟未完成，已自动放弃",
            {"error_code": "TASK_TIMEOUT", "timeout_seconds": effective_timeout},
            True,
        )

    try:
        from celery.exceptions import SoftTimeLimitExceeded

        if isinstance(exc, SoftTimeLimitExceeded):
            timeout_minutes = max(round(timeout_seconds / 60), 1)
            return (
                f"任务超过 {timeout_minutes} 分钟未完成，已自动放弃",
                {"error_code": "TASK_TIMEOUT", "timeout_seconds": timeout_seconds},
                True,
            )
    except Exception as classification_error:
        logger.debug(
            "could not classify Celery timeout: %s",
            classification_error,
        )

    if is_model_quota_error(exc):
        return MODEL_QUOTA_EXCEEDED_MESSAGE, model_quota_payload(exc), True

    try:
        from ai_anime.modules.story_intake.public import StoryImportRequired

        if isinstance(exc, StoryImportRequired):
            return str(exc), {"error_code": exc.error_code}, True
    except Exception as classification_error:
        logger.debug(
            "could not classify story-import prerequisite failure: %s",
            classification_error,
        )

    try:
        from ai_anime.modules.asset_world.public import Sharp3DUnavailable

        if isinstance(exc, Sharp3DUnavailable):
            return str(exc), {"error_code": exc.error_code}, True
    except Exception as classification_error:
        logger.debug(
            "could not classify Sharp3D failure: %s",
            classification_error,
        )

    try:
        from ai_anime.modules.asset_world.public import BlockWorldUnavailable

        if isinstance(exc, BlockWorldUnavailable):
            return str(exc), {"error_code": exc.error_code}, True
    except Exception as classification_error:
        logger.debug(
            "could not classify block-world failure: %s",
            classification_error,
        )

    action_required_code = str(getattr(exc, "code", "") or "").strip()
    if action_required_code and bool(getattr(exc, "action_required", False)):
        details = [
            str(item).strip()
            for item in (getattr(exc, "errors", None) or [])
            if str(item).strip()
        ]
        return (
            str(exc),
            {
                "error_code": action_required_code,
                "action_required": True,
                "prereq_errors": details,
            },
            True,
        )

    try:
        from ai_anime.shared.provider_errors import (
            content_moderation_payload,
            is_content_moderation_error,
        )

        if is_content_moderation_error(exc):
            payload = content_moderation_payload(exc)
            return str(payload.get("message") or ""), payload, True
    except Exception as classification_error:
        logger.debug(
            "could not classify content-moderation failure: %s",
            classification_error,
        )

    if not isinstance(exc, Exception):
        raise exc
    from ai_anime.shared.utils.error_redaction import safe_exception_message

    return safe_exception_message(exc), {}, False


def execute_project_task_sync(
    envelope: dict[str, Any],
    context: Any,
    manager: Any,
    *,
    run_task_id: str,
    cancellation_check: CancellationCheck,
    task_run_context: ContextFactory,
    subprocess_context: ContextFactory,
    runner_loader: RunnerLoader,
    runner_resolver: RunnerResolver,
    timeout_seconds: int,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    task_type = str(envelope["task_type"])
    episode = int(envelope.get("episode") or 0)
    beat_num = envelope.get("beat_num")
    scope = envelope.get("scope")
    run_metadata = dict(metadata or {})
    deadline_monotonic = (
        time.monotonic() + timeout_seconds if timeout_seconds > 0 else None
    )

    if asyncio.run(
        cancellation_check(
            project_id=str(envelope["project_id"]),
            task_type=task_type,
            episode=episode,
            task_id=run_task_id,
            beat_num=beat_num,
            scope=scope,
        )
    ):
        manager.update_progress_for_project(
            context,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
            progress=0.0,
            current_task="任务已取消",
            metadata=run_metadata,
            status="cancelled",
            expected_task_id=run_task_id,
        )
        return {"cancelled": True}

    with task_run_context(run_task_id), subprocess_context(
        project_id=str(envelope["project_id"]),
        task_type=task_type,
        episode=episode,
        task_id=run_task_id,
        beat_num=beat_num,
        scope=scope,
        deadline_monotonic=deadline_monotonic,
        timeout_seconds=timeout_seconds,
    ):
        manager.update_progress_for_project(
            context,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
            progress=0.01,
            current_task="任务已开始",
            metadata=run_metadata,
        )

        runner_loader()
        runner = runner_resolver(task_type)
        if runner is None:
            error = f"No project task runner registered for task_type={task_type}"
            manager.fail_task_for_project(
                context,
                task_type,
                episode,
                beat_num=beat_num,
                scope=scope,
                error=error,
                metadata=run_metadata,
                expected_task_id=run_task_id,
            )
            raise RuntimeError(error)

        try:
            runner_envelope = {**envelope, "__run_task_id": run_task_id}
            if deadline_monotonic is not None:
                runner_envelope["__deadline_monotonic"] = deadline_monotonic
                runner_envelope["__timeout_seconds"] = timeout_seconds
            result = runner(runner_envelope, context)
        except BaseException as exc:
            if isinstance(exc, TaskCancelled):
                manager.update_progress_for_project(
                    context,
                    task_type,
                    episode,
                    beat_num=beat_num,
                    scope=scope,
                    progress=0.0,
                    current_task="任务已取消",
                    metadata=run_metadata,
                    status="cancelled",
                    expected_task_id=run_task_id,
                )
                return {"cancelled": True}
            error, failure_payload, handled = project_task_failure_for_exception(
                exc,
                timeout_seconds=timeout_seconds,
            )
            manager.fail_task_for_project(
                context,
                task_type,
                episode,
                beat_num=beat_num,
                scope=scope,
                error=error,
                metadata={**run_metadata, **failure_payload},
                expected_task_id=run_task_id,
            )
            if handled:
                return {"failed": True, **failure_payload}
            raise

        manager.complete_task_for_project(
            context,
            task_type,
            episode,
            beat_num=beat_num,
            scope=scope,
            result=result or {"ok": True},
            current_task="完成",
            logs=["完成"],
            metadata=completion_metadata_with_provider_task_id(
                run_metadata,
                result,
            ),
            expected_task_id=run_task_id,
        )
    return result or {"ok": True}


__all__ = [
    "execute_project_task_sync",
    "project_task_failure_for_exception",
]

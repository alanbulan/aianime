"""Backend-neutral project task execution orchestration."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import AbstractContextManager
from typing import Any

from ai_anime.modules.model_usage.public import (
    INSUFFICIENT_CREDITS_MESSAGE,
    UsageMeter,
    insufficient_credits_payload,
    is_insufficient_credits_error,
)
from ai_anime.modules.task_execution.application.ports import ProjectTaskRunner
from ai_anime.modules.task_execution.domain.task_cancellation import (
    TaskCancelled,
    TaskTimedOut,
)
from ai_anime.modules.task_execution.domain.task_execution import (
    clean_billing_metadata,
    completion_metadata_with_provider_task_id,
    feature_credit_reservation_id,
    metrics_user_id_for_project_context,
    resource_kind_for_task,
    resource_refs_for_task_success,
)

logger = logging.getLogger(__name__)

CancellationCheck = Callable[..., Awaitable[bool]]
ContextFactory = Callable[..., AbstractContextManager[Any]]
RunnerLoader = Callable[[], None]
RunnerResolver = Callable[[str], ProjectTaskRunner | None]


def set_project_task_metrics_context(
    usage_meter: UsageMeter,
    context: Any,
    task_type: str,
    billing_metadata: dict[str, Any] | None = None,
) -> None:
    billing_user_id = metrics_user_id_for_project_context(context)
    context_metadata = {
        "billing_user_id": billing_user_id,
        "requester_user_id": str(
            getattr(context, "requester_user_id", "") or ""
        ).strip(),
        "project_owner_id": str(getattr(context, "owner_id", "") or "").strip(),
        "billing_task_type": task_type,
    }
    context_metadata.update(clean_billing_metadata(billing_metadata))
    usage_meter.set_llm_usage_context(
        billing_user_id,
        project_id=str(getattr(context, "project_id", "") or ""),
        resource_kind=resource_kind_for_task(task_type),
        billing_metadata={
            key: value for key, value in context_metadata.items() if value
        },
    )


def clear_project_task_metrics_context(usage_meter: UsageMeter) -> None:
    usage_meter.clear_llm_usage_context()


async def _confirm_feature_credit_reservation(
    usage_meter: UsageMeter,
    reservation_id: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> None:
    if not reservation_id:
        return
    try:
        await usage_meter.confirm_feature_credit_reservation(
            reservation_id,
            metadata=metadata,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("feature credit confirmation failed: %s", exc)


async def _refund_feature_credit_reservation(
    usage_meter: UsageMeter,
    reservation_id: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> None:
    if not reservation_id:
        return
    try:
        await usage_meter.refund_feature_credit_reservation(
            reservation_id,
            metadata=metadata,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("feature credit refund failed: %s", exc)


async def _emit_project_task_metrics(
    usage_meter: UsageMeter,
    context: Any,
    task_type: str,
    *,
    episode: int,
    beat_num: Any = None,
    scope: Any = None,
    result: Any = None,
    outcome: str = "success",
) -> None:
    try:
        user_id = metrics_user_id_for_project_context(context)
        project_id = str(getattr(context, "project_id", "") or "")
        kind = resource_kind_for_task(task_type)
        clean_outcome = "failed" if outcome == "failed" else "success"

        if task_type == "ingest_fast":
            model = (
                str(result.get("model") or "").strip()
                if isinstance(result, dict)
                else ""
            )
            if clean_outcome == "success":
                await usage_meter.bump_content_counter(
                    user_id=user_id,
                    metric="ingests_completed",
                    value=1,
                    model=model,
                    project_id=project_id,
                    resource_kind="ingest",
                )
            await usage_meter.log_resource_attempts(
                user_id=user_id,
                project_id=project_id,
                kind="ingest",
                refs=[f"project:{project_id}"],
                outcome=clean_outcome,
                model=model,
            )
            return

        if clean_outcome == "success" and task_type == "script_writer":
            beats = None
            if isinstance(result, dict):
                try:
                    parsed_beats = int(result.get("beats"))
                except (TypeError, ValueError):
                    parsed_beats = 0
                beats = parsed_beats if parsed_beats > 0 else None
            await usage_meter.bump_content_counter(
                user_id=user_id,
                metric="scripts_written",
                value=1,
                project_id=project_id,
            )
            if beats:
                await usage_meter.bump_content_counter(
                    user_id=user_id,
                    metric="beats_written",
                    value=beats,
                    project_id=project_id,
                )

        refs = resource_refs_for_task_success(
            task_type=task_type,
            episode=episode,
            beat_num=beat_num,
            scope=scope,
            result=result,
        )
        if not refs or not kind:
            return
        model = str(result.get("model") or "").strip() if isinstance(result, dict) else ""
        await usage_meter.log_resource_attempts(
            user_id=user_id,
            project_id=project_id,
            kind=kind,
            refs=refs,
            outcome=clean_outcome,
            model=model,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("project task metrics emit failed: %s", exc)


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

    if is_insufficient_credits_error(exc):
        return INSUFFICIENT_CREDITS_MESSAGE, insufficient_credits_payload(exc), True

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
    usage_meter: UsageMeter,
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
    billing_metadata = clean_billing_metadata(envelope.get("billing_metadata"))
    run_metadata = {**dict(metadata or {}), **billing_metadata}
    reservation_id = feature_credit_reservation_id(run_metadata)
    deadline_monotonic = (
        time.monotonic() + timeout_seconds if timeout_seconds > 0 else None
    )

    clear_project_task_metrics_context(usage_meter)

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
        asyncio.run(
            _refund_feature_credit_reservation(
                usage_meter,
                reservation_id,
                metadata={"source": "task_cancelled_before_start"},
            )
        )
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

    try:
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
            set_project_task_metrics_context(
                usage_meter,
                context,
                task_type,
                billing_metadata=billing_metadata,
            )
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
                asyncio.run(
                    _refund_feature_credit_reservation(
                        usage_meter,
                        reservation_id,
                        metadata={"source": "task_runner_missing", "error": error},
                    )
                )
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
                    asyncio.run(
                        _refund_feature_credit_reservation(
                            usage_meter,
                            reservation_id,
                            metadata={"source": "task_cancelled"},
                        )
                    )
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
                asyncio.run(
                    _refund_feature_credit_reservation(
                        usage_meter,
                        reservation_id,
                        metadata={
                            "source": "task_failed",
                            "error": error,
                            **failure_payload,
                        },
                    )
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
                asyncio.run(
                    _emit_project_task_metrics(
                        usage_meter,
                        context,
                        task_type,
                        episode=episode,
                        beat_num=beat_num,
                        scope=scope,
                        outcome="failed",
                    )
                )
                if handled:
                    return {"failed": True, **failure_payload}
                raise

            asyncio.run(
                _emit_project_task_metrics(
                    usage_meter,
                    context,
                    task_type,
                    episode=episode,
                    beat_num=beat_num,
                    scope=scope,
                    result=result,
                )
            )
            asyncio.run(
                _confirm_feature_credit_reservation(
                    usage_meter,
                    reservation_id,
                    metadata={"source": "task_completed"},
                )
            )
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
    finally:
        clear_project_task_metrics_context(usage_meter)


__all__ = [
    "clear_project_task_metrics_context",
    "execute_project_task_sync",
    "project_task_failure_for_exception",
    "set_project_task_metrics_context",
]

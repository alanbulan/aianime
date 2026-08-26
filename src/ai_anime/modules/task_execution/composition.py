"""Task Execution composition root."""

import os
import subprocess
from collections.abc import Callable, Sequence
from typing import Any

from ai_anime.modules.task_execution.application.project_tasks import (
    ProjectTaskUseCases,
)
from ai_anime.modules.task_execution.application.project_task_limits import (
    ProjectTaskLimitUseCases,
)
from ai_anime.modules.task_execution.application.project_task_submission import (
    ProjectTaskSubmissionUseCases,
)
from ai_anime.modules.task_execution.application.task_cancellation import (
    await_envelope_with_cancel_watch as _await_envelope_with_cancel_watch,
)
from ai_anime.modules.task_execution.application.task_cancellation import (
    await_with_cancel_watch as _await_with_cancel_watch,
)
from ai_anime.modules.task_execution.application.task_cancellation import (
    is_cancel_requested as _is_cancel_requested,
)
from ai_anime.modules.task_execution.application.task_cancellation import (
    raise_if_envelope_cancel_requested as _raise_if_envelope_cancel_requested,
)
from ai_anime.modules.task_execution.infrastructure.admission_policy import (
    EnvironmentTaskAdmissionPolicy,
)
from ai_anime.modules.task_execution.infrastructure.project_task_capacity import (
    LocalProjectTaskCapacityGateway,
)
from ai_anime.modules.task_execution.infrastructure.project_tasks import (
    LocalProjectTaskGateway,
)

from ai_anime.modules.task_execution.infrastructure.runner_registry import (
    get_project_task_runner,
    register_project_task_runner,
    registered_project_task_types,
)


def _task_manager() -> Any:
    from ai_anime.modules.task_execution.infrastructure.task_state import (
        get_task_manager,
    )

    return get_task_manager()


def _task_backend() -> Any:
    from ai_anime.shared.ports import get_task_backend

    return get_task_backend()


def _cancellation_store() -> Any:
    from ai_anime.shared.ports import get_cancellation_store

    return get_cancellation_store()


def _usage_meter() -> Any:
    from ai_anime.modules.model_usage.public import get_usage_meter

    return get_usage_meter()


async def _eligible_user_count(context: Any) -> int:
    from ai_anime.modules.project_workspace.public import (
        count_project_task_eligible_users,
    )

    return await count_project_task_eligible_users(context)


def create_project_task_use_cases(
    *,
    task_manager_provider: Callable[[], Any],
    task_backend_provider: Callable[[], Any],
) -> ProjectTaskUseCases:
    return ProjectTaskUseCases(
        LocalProjectTaskGateway(task_manager_provider, task_backend_provider)
    )


def create_project_task_limit_use_cases(
    *,
    task_manager_provider: Callable[[], Any],
    eligible_user_counter: Callable[[Any], Any],
) -> ProjectTaskLimitUseCases:
    return ProjectTaskLimitUseCases(
        LocalProjectTaskCapacityGateway(
            task_manager_provider,
            eligible_user_counter,
        ),
        EnvironmentTaskAdmissionPolicy(),
    )


_project_task_use_cases = create_project_task_use_cases(
    task_manager_provider=_task_manager,
    task_backend_provider=_task_backend,
)
_project_task_limit_use_cases = create_project_task_limit_use_cases(
    task_manager_provider=_task_manager,
    eligible_user_counter=_eligible_user_count,
)
_project_task_submission_use_cases = ProjectTaskSubmissionUseCases(_task_backend)


def project_task_use_cases() -> ProjectTaskUseCases:
    return _project_task_use_cases


def project_task_limit_use_cases() -> ProjectTaskLimitUseCases:
    return _project_task_limit_use_cases


def project_task_submission_use_cases() -> ProjectTaskSubmissionUseCases:
    return _project_task_submission_use_cases


def build_inline_task_backend() -> Any:
    from ai_anime.modules.task_execution.infrastructure.inline_backend import (
        InlineTaskBackend,
    )

    return InlineTaskBackend(
        execute_project_task=run_project_task_core_sync,
        cancellation_store_provider=_cancellation_store,
        process_killer=kill_task_processes,
    )


def build_in_memory_cancellation_store() -> Any:
    from ai_anime.modules.task_execution.infrastructure.inline_backend import (
        InMemoryCancellationStore,
    )

    return InMemoryCancellationStore()


def run_project_task_core_sync(
    envelope: dict[str, Any],
    context: Any,
    manager: Any,
    *,
    run_task_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from ai_anime.modules.task_execution.application.project_task_execution import (
        execute_project_task_sync,
    )
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        project_task_subprocess_context as subprocess_context,
    )
    from ai_anime.modules.task_execution.infrastructure.project_task_runtime import (
        ensure_builtin_runners_registered,
        project_task_run_context,
        project_task_timeout_seconds,
    )
    from ai_anime.modules.task_execution.infrastructure.native_task_isolation import (
        wrap_project_task_runner,
    )
    from ai_anime.modules.task_execution.infrastructure.runner_registry import (
        get_project_task_runner as resolve_direct_runner,
    )

    def resolve_runner(task_type: str):
        return wrap_project_task_runner(
            task_type,
            resolve_direct_runner(task_type),
            metadata=metadata,
            cancellation_check=is_cancel_requested,
        )

    return execute_project_task_sync(
        envelope,
        context,
        manager,
        run_task_id=run_task_id,
        metadata=metadata,
        usage_meter=_usage_meter(),
        cancellation_check=is_cancel_requested,
        task_run_context=project_task_run_context,
        subprocess_context=subprocess_context,
        runner_loader=ensure_builtin_runners_registered,
        runner_resolver=resolve_runner,
        timeout_seconds=project_task_timeout_seconds(
            str(envelope.get("task_type") or "")
        ),
    )


async def is_cancel_requested(
    *,
    project_id: str,
    task_type: str,
    episode: int,
    task_id: str,
    beat_num: int | None = None,
    scope: str | None = None,
) -> bool:
    return await _is_cancel_requested(
        _cancellation_store,
        project_id=project_id,
        task_type=task_type,
        episode=episode,
        task_id=task_id,
        beat_num=beat_num,
        scope=scope,
    )


async def await_envelope_with_cancel_watch(
    coro,
    envelope: dict[str, Any],
    *,
    task_type: str | None = None,
    episode: int | None = None,
    beat_num: int | None = None,
    scope: str | None = None,
):
    return await _await_envelope_with_cancel_watch(
        coro,
        envelope,
        cancellation_store_provider=_cancellation_store,
        task_type=task_type,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )


async def await_with_cancel_watch(
    coro,
    *,
    project_id: str,
    task_type: str,
    episode: int,
    task_id: str,
    beat_num: int | None = None,
    scope: str | None = None,
    deadline_monotonic: float | None = None,
    timeout_seconds: int | None = None,
    poll_seconds: float = 0.5,
):
    return await _await_with_cancel_watch(
        coro,
        cancellation_store_provider=_cancellation_store,
        project_id=project_id,
        task_type=task_type,
        episode=episode,
        task_id=task_id,
        beat_num=beat_num,
        scope=scope,
        deadline_monotonic=deadline_monotonic,
        timeout_seconds=timeout_seconds,
        poll_seconds=poll_seconds,
    )


def raise_if_envelope_cancel_requested(
    envelope: dict[str, Any],
    *,
    task_type: str | None = None,
    episode: int | None = None,
    beat_num: int | None = None,
    scope: str | None = None,
) -> None:
    _raise_if_envelope_cancel_requested(
        envelope,
        cancellation_store_provider=_cancellation_store,
        task_type=task_type,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )


def project_task_subprocess_context(
    *,
    project_id: str,
    task_type: str,
    episode: int,
    task_id: str,
    beat_num: int | None = None,
    scope: str | None = None,
    deadline_monotonic: float | None = None,
    timeout_seconds: int | None = None,
):
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        project_task_subprocess_context as subprocess_context,
    )

    return subprocess_context(
        project_id=project_id,
        task_type=task_type,
        episode=episode,
        task_id=task_id,
        beat_num=beat_num,
        scope=scope,
        deadline_monotonic=deadline_monotonic,
        timeout_seconds=timeout_seconds,
    )


def active_subprocess_count(task_id: str | None = None) -> int:
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        active_subprocess_count as count_active_subprocesses,
    )

    return count_active_subprocesses(task_id)


def kill_task_processes(task_id: str) -> int:
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        kill_task_processes as kill_processes,
    )

    return kill_processes(task_id)


def run_project_subprocess(
    args: Sequence[str],
    *,
    envelope: dict[str, Any] | None = None,
    timeout: int | float | None = None,
    capture_output: bool = False,
    text: bool = False,
    check: bool = False,
    cwd: str | os.PathLike[str] | None = None,
    env: dict[str, str] | None = None,
    stdin_data: str | bytes | None = None,
    poll_seconds: float = 0.1,
) -> subprocess.CompletedProcess:
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        run_project_subprocess as execute_subprocess,
    )

    return execute_subprocess(
        args,
        cancellation_check=is_cancel_requested,
        envelope=envelope,
        timeout=timeout,
        capture_output=capture_output,
        text=text,
        check=check,
        cwd=cwd,
        env=env,
        stdin_data=stdin_data,
        poll_seconds=poll_seconds,
    )


def run_project_model_subprocess(
    args: Sequence[str],
    *,
    env: dict[str, str] | None = None,
    **kwargs: Any,
) -> subprocess.CompletedProcess:
    from ai_anime.modules.task_execution.infrastructure.project_subprocesses import (
        run_project_model_subprocess as execute_model_subprocess,
    )

    return execute_model_subprocess(
        args,
        cancellation_check=is_cancel_requested,
        env=env,
        **kwargs,
    )


__all__ = [
    "active_subprocess_count",
    "await_envelope_with_cancel_watch",
    "await_with_cancel_watch",
    "build_in_memory_cancellation_store",
    "build_inline_task_backend",
    "create_project_task_limit_use_cases",
    "create_project_task_use_cases",
    "get_project_task_runner",
    "is_cancel_requested",
    "kill_task_processes",
    "project_task_use_cases",
    "project_task_limit_use_cases",
    "project_task_submission_use_cases",
    "project_task_subprocess_context",
    "register_project_task_runner",
    "raise_if_envelope_cancel_requested",
    "registered_project_task_types",
    "run_project_task_core_sync",
    "run_project_model_subprocess",
    "run_project_subprocess",
]

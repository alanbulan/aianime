"""Public contracts exposed by the Task Execution bounded context."""

from ai_anime.modules.task_execution.application.cloud_tasks import (
    CancellationCheck,
    CloudAdapter,
    CloudTaskCancelled,
    CloudTaskRequest,
    CloudTaskResult,
    ProgressCallback,
)
from ai_anime.modules.task_execution.application.ports import (
    CancellationStore,
    ProjectTaskGateway,
    ProjectTaskCapacityGateway,
    ProjectTaskRunner,
    QueuedTask,
    TaskBackend,
    TaskAdmissionPolicy,
)
from ai_anime.modules.task_execution.application.project_task_limits import (
    ProjectTaskLimitUseCases,
)
from ai_anime.modules.task_execution.application.project_task_submission import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionReceipt,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.modules.task_execution.application.project_tasks import (
    ProjectTaskUseCases,
)
from ai_anime.modules.task_execution.application.task_cancellation import (
    remaining_timeout_seconds,
)
from ai_anime.modules.task_execution.domain.queue import (
    QUEUE_KINDS,
    normalize_queue_kind,
    queue_name,
)
from ai_anime.modules.task_execution.domain.cloud_task import (
    CloudTaskKind,
    cloud_task_kind,
)
from ai_anime.modules.task_execution.domain.admission import (
    GlobalLaneQueueLimitExceeded,
    ProjectLaneCapacity,
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
    remaining_capacity,
)
from ai_anime.modules.task_execution.domain.project_task import (
    ProjectTask,
    ProjectTaskRef,
    effective_task_status,
)
from ai_anime.modules.task_execution.domain.task_identity import cancel_key
from ai_anime.modules.task_execution.domain.task_identity import (
    TASK_IDENTITY_SPECS,
    TaskIdentitySpec,
    actor_name_for_project_task,
    actor_name_for_task,
    hashed_scope,
    project_task_scope_from_key,
    project_task_state_key,
    selection_scope,
    task_config_scope,
    task_scope_from_key,
    task_state_key,
)
from ai_anime.modules.task_execution.domain.task_metadata import (
    display_metadata_for_task,
)
from ai_anime.modules.task_execution.domain.task_time import parse_task_timestamp
from ai_anime.modules.task_execution.domain.script_progress import (
    beat_has_script_content,
    script_beats_complete,
)
from ai_anime.modules.task_execution.domain.task_restart_recovery import (
    ACTIVE_PROJECT_TASK_STATUSES,
    InterruptedTaskRecoveryPlan,
    TERMINAL_TASK_STATUSES,
)
from ai_anime.modules.task_execution.domain.task_cancellation import (
    TaskCancelled,
    TaskTimedOut,
)
from ai_anime.modules.task_execution.composition import (
    active_subprocess_count,
    await_envelope_with_cancel_watch,
    await_with_cancel_watch,
    build_in_memory_cancellation_store,
    build_inline_task_backend,
    create_project_task_limit_use_cases,
    create_project_task_use_cases,
    get_project_task_runner,
    is_cancel_requested,
    kill_task_processes,
    project_task_use_cases,
    project_task_limit_use_cases,
    project_task_submission_use_cases,
    project_task_subprocess_context,
    register_project_task_runner,
    raise_if_envelope_cancel_requested,
    registered_project_task_types,
    run_project_model_subprocess,
    run_project_subprocess,
    run_project_task_core_sync,
)
from ai_anime.modules.task_execution.infrastructure.admission_policy import (
    global_lane_concurrency,
    global_lane_queue_limit,
    project_lane_active_limit,
    project_lane_effective_active_limit,
    project_lane_min_active_limit,
    project_user_lane_active_limit,
)
from ai_anime.modules.task_execution.infrastructure.task_state import (
    get_task_manager,
)
from ai_anime.modules.task_execution.presentation.project_task_projection import (
    serialize_project_task,
)

__all__ = [
    "active_subprocess_count",
    "ACTIVE_PROJECT_TASK_STATUSES",
    "CancellationCheck",
    "CancellationStore",
    "CloudAdapter",
    "CloudTaskCancelled",
    "CloudTaskKind",
    "CloudTaskRequest",
    "CloudTaskResult",
    "GlobalLaneQueueLimitExceeded",
    "InterruptedTaskRecoveryPlan",
    "ProjectLaneCapacity",
    "ProjectTask",
    "ProjectTaskCapacityGateway",
    "ProjectTaskGateway",
    "ProjectTaskRef",
    "ProjectTaskLimitExceeded",
    "ProjectTaskLimitUseCases",
    "ProjectTaskSubmission",
    "ProjectTaskSubmissionReceipt",
    "ProjectTaskSubmissionUseCases",
    "ProjectTaskRunner",
    "ProjectTaskUseCases",
    "ProjectUserTaskLimitExceeded",
    "QUEUE_KINDS",
    "TASK_IDENTITY_SPECS",
    "TaskIdentitySpec",
    "QueuedTask",
    "ProgressCallback",
    "TaskBackend",
    "TaskAdmissionPolicy",
    "TaskCancelled",
    "TaskTimedOut",
    "TERMINAL_TASK_STATUSES",
    "actor_name_for_project_task",
    "actor_name_for_task",
    "build_in_memory_cancellation_store",
    "build_inline_task_backend",
    "await_envelope_with_cancel_watch",
    "await_with_cancel_watch",
    "beat_has_script_content",
    "cancel_key",
    "cloud_task_kind",
    "create_project_task_limit_use_cases",
    "create_project_task_use_cases",
    "display_metadata_for_task",
    "effective_task_status",
    "get_project_task_runner",
    "global_lane_concurrency",
    "global_lane_queue_limit",
    "hashed_scope",
    "is_cancel_requested",
    "get_task_manager",
    "kill_task_processes",
    "normalize_queue_kind",
    "parse_task_timestamp",
    "project_task_use_cases",
    "project_task_limit_use_cases",
    "project_task_submission_use_cases",
    "project_lane_active_limit",
    "project_lane_effective_active_limit",
    "project_lane_min_active_limit",
    "project_user_lane_active_limit",
    "project_task_scope_from_key",
    "project_task_state_key",
    "project_task_subprocess_context",
    "queue_name",
    "remaining_capacity",
    "remaining_timeout_seconds",
    "register_project_task_runner",
    "raise_if_envelope_cancel_requested",
    "registered_project_task_types",
    "run_project_model_subprocess",
    "run_project_subprocess",
    "run_project_task_core_sync",
    "selection_scope",
    "serialize_project_task",
    "script_beats_complete",
    "task_config_scope",
    "task_scope_from_key",
    "task_state_key",
]

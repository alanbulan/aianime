"""Task Execution domain contracts."""

from ai_anime.modules.task_execution.domain.admission import (
    GlobalLaneQueueLimitExceeded,
    ProjectLaneCapacity,
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
    remaining_capacity,
)
from ai_anime.modules.task_execution.domain.cloud_task import (
    CloudTaskKind,
    cloud_task_kind,
)
from ai_anime.modules.task_execution.domain.queue import (
    QUEUE_KINDS,
    normalize_queue_kind,
    queue_name,
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
from ai_anime.modules.task_execution.domain.task_cancellation import (
    TaskCancelled,
    TaskTimedOut,
)
from ai_anime.modules.task_execution.domain.task_time import parse_task_timestamp
from ai_anime.modules.task_execution.domain.task_restart_recovery import (
    ACTIVE_PROJECT_TASK_STATUSES,
    InterruptedTaskRecoveryPlan,
    TERMINAL_TASK_STATUSES,
    build_interrupted_inline_recovery_plan,
)
from ai_anime.modules.task_execution.domain.script_progress import (
    beat_has_script_content,
    script_beats_complete,
)

__all__ = [
    "CloudTaskKind",
    "ACTIVE_PROJECT_TASK_STATUSES",
    "GlobalLaneQueueLimitExceeded",
    "ProjectLaneCapacity",
    "ProjectTaskLimitExceeded",
    "ProjectUserTaskLimitExceeded",
    "InterruptedTaskRecoveryPlan",
    "QUEUE_KINDS",
    "ProjectTask",
    "ProjectTaskRef",
    "TASK_IDENTITY_SPECS",
    "TaskIdentitySpec",
    "TaskCancelled",
    "TaskTimedOut",
    "TERMINAL_TASK_STATUSES",
    "actor_name_for_project_task",
    "actor_name_for_task",
    "cancel_key",
    "cloud_task_kind",
    "build_interrupted_inline_recovery_plan",
    "beat_has_script_content",
    "display_metadata_for_task",
    "effective_task_status",
    "hashed_scope",
    "normalize_queue_kind",
    "parse_task_timestamp",
    "project_task_scope_from_key",
    "project_task_state_key",
    "queue_name",
    "remaining_capacity",
    "selection_scope",
    "script_beats_complete",
    "task_config_scope",
    "task_scope_from_key",
    "task_state_key",
]

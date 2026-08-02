"""Task Execution application contracts."""

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
    ProjectTaskCapacityGateway,
    ProjectTaskGateway,
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
    await_envelope_with_cancel_watch,
    await_with_cancel_watch,
    is_cancel_requested,
    raise_if_envelope_cancel_requested,
    remaining_timeout_seconds,
)

__all__ = [
    "CancellationCheck",
    "CancellationStore",
    "CloudAdapter",
    "CloudTaskCancelled",
    "CloudTaskRequest",
    "CloudTaskResult",
    "ProjectTaskCapacityGateway",
    "ProjectTaskLimitUseCases",
    "ProjectTaskSubmission",
    "ProjectTaskSubmissionReceipt",
    "ProjectTaskSubmissionUseCases",
    "ProjectTaskGateway",
    "ProjectTaskUseCases",
    "ProjectTaskRunner",
    "ProgressCallback",
    "QueuedTask",
    "TaskBackend",
    "TaskAdmissionPolicy",
    "await_envelope_with_cancel_watch",
    "await_with_cancel_watch",
    "is_cancel_requested",
    "raise_if_envelope_cancel_requested",
    "remaining_timeout_seconds",
]

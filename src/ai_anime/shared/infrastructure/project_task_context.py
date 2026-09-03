"""Current project-task identity propagated through asynchronous model calls."""

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

_CURRENT_PROJECT_TASK_ID: ContextVar[str | None] = ContextVar(
    "ai_anime_current_project_task_id",
    default=None,
)


@contextmanager
def project_task_run_context(task_id: str) -> Iterator[None]:
    token = _CURRENT_PROJECT_TASK_ID.set(str(task_id).strip())
    try:
        yield
    finally:
        _CURRENT_PROJECT_TASK_ID.reset(token)


def get_current_project_task_id() -> str:
    return str(_CURRENT_PROJECT_TASK_ID.get() or "").strip()

"""In-process registry for project task runner adapters."""

from __future__ import annotations

from ai_anime.modules.task_execution.application.ports import ProjectTaskRunner

_PROJECT_TASK_RUNNERS: dict[str, ProjectTaskRunner] = {}


def register_project_task_runner(task_type: str, runner: ProjectTaskRunner) -> None:
    _PROJECT_TASK_RUNNERS[task_type] = runner


def get_project_task_runner(task_type: str) -> ProjectTaskRunner | None:
    return _PROJECT_TASK_RUNNERS.get(task_type)


def registered_project_task_types() -> tuple[str, ...]:
    return tuple(sorted(_PROJECT_TASK_RUNNERS))


__all__ = [
    "get_project_task_runner",
    "register_project_task_runner",
    "registered_project_task_types",
]

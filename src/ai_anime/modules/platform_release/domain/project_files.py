"""Project file path rules."""

from __future__ import annotations

from pathlib import Path


class ProjectFileError(Exception):
    """Base error for project file delivery."""


class ProjectDirectoryNotFound(ProjectFileError):
    pass


class ProjectFileAccessDenied(ProjectFileError):
    pass


class ProjectFileNotFound(ProjectFileError):
    pass


def resolve_project_file_path(project_dir: Path, file_path: str) -> Path:
    project_root = project_dir.resolve()
    requested = (project_root / file_path).resolve()
    if not requested.is_relative_to(project_root):
        raise ProjectFileAccessDenied
    return requested

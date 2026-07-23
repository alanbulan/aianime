"""Project Workspace application errors."""

from __future__ import annotations


class ProjectWorkspaceError(Exception):
    """Base class for project scope resolution failures."""


class ProjectBackendNotInitialized(ProjectWorkspaceError):
    pass


class ProjectNotFound(ProjectWorkspaceError):
    pass


class ProjectUserIdentityUnresolved(ProjectWorkspaceError):
    pass


class ProjectHomeNodeRequired(ProjectWorkspaceError):
    def __init__(
        self,
        *,
        project_id: str,
        home_node_id: str,
        operation: str,
    ) -> None:
        self.project_id = project_id
        self.home_node_id = home_node_id
        self.operation = operation
        super().__init__(f"{operation} must run on the project home node")

"""Stable Project Workspace application API."""

from pathlib import Path
from typing import Any, Mapping

from ai_anime.modules.project_workspace.application.dto import (
    AccessibleProject,
    ProjectSummaryData,
    RequesterIdentity,
)
from ai_anime.modules.project_workspace.application.errors import (
    InvalidProjectName,
    ProjectAlreadyExists,
    ProjectBackendNotInitialized,
    ProjectHomeNodeRequired,
    ProjectNotFound,
    ProjectLifecycleConflict,
    ProjectUserIdentityUnresolved,
    ProjectWorkspaceError,
)
from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    require_project_home_node,
)
from ai_anime.modules.project_workspace.application.ports import (
    ProjectAccess,
    ProjectRegistry,
)
from ai_anime.modules.project_workspace.domain import (
    Principal,
    ProjectLifecycleAction,
    ProjectRecord,
    ProjectRoleRequired,
)


async def resolve_project_context(
    *,
    user: Mapping[str, Any],
    project_id: str | None = None,
    project_name: str | None = None,
    required_role: str = "viewer",
) -> ProjectContext:
    from ai_anime.modules.project_workspace.composition import (
        resolve_project_context as resolve_context,
    )

    return await resolve_context(
        requester=RequesterIdentity.from_mapping(user),
        project_id=project_id,
        project_name=project_name,
        required_role=required_role,
    )


async def list_project_workspaces(
    user: Mapping[str, Any],
) -> list[AccessibleProject]:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().list_accessible(
        RequesterIdentity.from_mapping(user)
    )


async def list_project_summaries(
    user: Mapping[str, Any],
    *,
    status: str,
) -> list[ProjectSummaryData]:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().list_summaries(
        RequesterIdentity.from_mapping(user),
        status=status,
    )


async def create_project_workspace(
    user: Mapping[str, Any],
    *,
    name: str,
) -> ProjectRecord:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().create(
        RequesterIdentity.from_mapping(user),
        name=name,
    )


async def get_project_details(
    user: Mapping[str, Any],
    *,
    project_id: str,
) -> dict:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().details(
        RequesterIdentity.from_mapping(user),
        project_id=project_id,
    )


async def change_project_status(
    user: Mapping[str, Any],
    *,
    project_id: str,
    action: ProjectLifecycleAction,
) -> ProjectSummaryData:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().change_status(
        RequesterIdentity.from_mapping(user),
        project_id=project_id,
        action=action,
    )


async def purge_project_workspace(
    user: Mapping[str, Any],
    *,
    project_id: str,
) -> ProjectRecord:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().purge(
        RequesterIdentity.from_mapping(user),
        project_id=project_id,
    )


async def find_project_record(project_id: str) -> ProjectRecord | None:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().find_record(project_id)


async def count_project_task_eligible_users(ctx: ProjectContext) -> int:
    from ai_anime.modules.project_workspace.composition import project_workspaces

    return await project_workspaces().count_task_eligible_users(ctx)


def build_local_project_adapters() -> tuple[ProjectRegistry, ProjectAccess]:
    from ai_anime.modules.project_workspace.infrastructure.local_registry import (
        AllowAllProjectAccess,
        SQLiteProjectRegistry,
    )

    return SQLiteProjectRegistry(), AllowAllProjectAccess()


def get_user_output_dir(username: str) -> Path:
    from ai_anime.modules.project_workspace.infrastructure.workspace_storage import (
        user_output_dir,
    )

    return user_output_dir(username)


__all__ = [
    "AccessibleProject",
    "InvalidProjectName",
    "Principal",
    "ProjectAlreadyExists",
    "ProjectAccess",
    "ProjectBackendNotInitialized",
    "ProjectContext",
    "ProjectHomeNodeRequired",
    "ProjectLifecycleAction",
    "ProjectLifecycleConflict",
    "ProjectNotFound",
    "ProjectRecord",
    "ProjectRegistry",
    "ProjectRoleRequired",
    "ProjectUserIdentityUnresolved",
    "ProjectWorkspaceError",
    "ProjectSummaryData",
    "build_local_project_adapters",
    "change_project_status",
    "count_project_task_eligible_users",
    "create_project_workspace",
    "find_project_record",
    "get_project_details",
    "get_user_output_dir",
    "list_project_summaries",
    "list_project_workspaces",
    "purge_project_workspace",
    "require_project_home_node",
    "resolve_project_context",
]

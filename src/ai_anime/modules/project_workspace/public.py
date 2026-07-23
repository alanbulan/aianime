"""Stable Project Workspace application API."""

from ai_anime.modules.project_workspace.application.errors import (
    ProjectBackendNotInitialized,
    ProjectHomeNodeRequired,
    ProjectNotFound,
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
    ProjectRecord,
    ProjectRoleRequired,
)


def is_record_home_node(project: ProjectRecord) -> bool:
    from ai_anime.modules.project_workspace.composition import (
        is_record_home_node as resolve_record_home_node,
    )

    return resolve_record_home_node(project)


async def user_id_from_api_user(user: dict) -> str:
    from ai_anime.modules.project_workspace.composition import (
        user_id_from_api_user as resolve_user_id,
    )

    return await resolve_user_id(user)


async def resolve_project_context(
    *,
    user: dict,
    project_id: str | None = None,
    project_name: str | None = None,
    required_role: str = "viewer",
) -> ProjectContext:
    from ai_anime.modules.project_workspace.composition import (
        resolve_project_context as resolve_context,
    )

    return await resolve_context(
        user=user,
        project_id=project_id,
        project_name=project_name,
        required_role=required_role,
    )

__all__ = [
    "Principal",
    "ProjectAccess",
    "ProjectBackendNotInitialized",
    "ProjectContext",
    "ProjectHomeNodeRequired",
    "ProjectNotFound",
    "ProjectRecord",
    "ProjectRegistry",
    "ProjectRoleRequired",
    "ProjectUserIdentityUnresolved",
    "ProjectWorkspaceError",
    "is_record_home_node",
    "require_project_home_node",
    "resolve_project_context",
    "user_id_from_api_user",
]

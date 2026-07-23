"""Runtime composition for the Project Workspace bounded context."""

from __future__ import annotations

from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    ProjectScopeResolver,
    is_record_home_node as record_is_on_worker,
)
from ai_anime.modules.project_workspace.application.errors import (
    ProjectBackendNotInitialized,
)
from ai_anime.modules.project_workspace.domain import ProjectRecord
from ai_anime.ports import get_project_access, get_project_registry
from ai_anime.ports.registry import PortNotRegistered
from ai_anime.shared.node_identity import resolve_worker_id


def _resolver() -> ProjectScopeResolver:
    try:
        registry = get_project_registry()
        access = get_project_access()
    except PortNotRegistered:
        raise ProjectBackendNotInitialized from None
    return ProjectScopeResolver(registry, access, resolve_worker_id)


def is_record_home_node(project: ProjectRecord) -> bool:
    return record_is_on_worker(project, resolve_worker_id())


async def user_id_from_api_user(user: dict) -> str:
    return await _resolver().user_id_from_user(user)


async def resolve_project_context(
    *,
    user: dict,
    project_id: str | None = None,
    project_name: str | None = None,
    required_role: str = "viewer",
) -> ProjectContext:
    return await _resolver().resolve(
        user=user,
        project_id=project_id,
        project_name=project_name,
        required_role=required_role,
    )

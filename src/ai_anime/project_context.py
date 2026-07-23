"""Compatibility facade for the Project Workspace application service."""

from __future__ import annotations

from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    ProjectScopeResolver,
    context_from_record,
    is_record_home_node as _is_record_home_node,
    require_project_home_node,
    require_project_role,
)
from ai_anime.modules.project_workspace.domain import Principal, ProjectRecord
from ai_anime.modules.project_workspace.public import ProjectBackendNotInitialized
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
    return _is_record_home_node(project, resolve_worker_id())


async def user_id_from_api_user(user: dict) -> str:
    return await _resolver().user_id_from_user(user)


def _ctx_from_record(
    *,
    project: ProjectRecord,
    requester_user_id: str,
    requester_username: str,
    principals: list[Principal],
    role: str,
) -> ProjectContext:
    return context_from_record(
        project=project,
        requester_user_id=requester_user_id,
        requester_username=requester_username,
        principals=principals,
        role=role,
        is_home_node=is_record_home_node(project),
    )


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


__all__ = [
    "ProjectContext",
    "is_record_home_node",
    "require_project_home_node",
    "require_project_role",
    "resolve_project_context",
    "user_id_from_api_user",
]

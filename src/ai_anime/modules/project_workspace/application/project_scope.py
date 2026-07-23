"""Resolve authenticated users and project records into a local project scope."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ai_anime.modules.project_workspace.application.errors import (
    ProjectHomeNodeRequired,
    ProjectNotFound,
    ProjectUserIdentityUnresolved,
)
from ai_anime.modules.project_workspace.application.dto import RequesterIdentity
from ai_anime.modules.project_workspace.application.ports import (
    ProjectAccess,
    ProjectRegistry,
)
from ai_anime.modules.project_workspace.domain import (
    Principal,
    ProjectRecord,
    require_role_value,
)


@dataclass(frozen=True)
class ProjectContext:
    project_id: str
    project_name: str
    owner_type: str
    owner_id: str
    owner_username: str
    requester_user_id: str
    requester_username: str
    requester_principals: tuple[tuple[str, str], ...]
    effective_role: str
    home_node_id: str
    output_dir: Path
    state_dir: Path
    runtime_dir: Path
    is_home_node: bool

    @property
    def owner_project_label(self) -> str:
        return f"{self.owner_username}/{self.project_name}"


def require_project_home_node(
    ctx: ProjectContext,
    *,
    operation: str = "project data access",
) -> ProjectContext:
    if ctx.is_home_node:
        return ctx
    raise ProjectHomeNodeRequired(
        project_id=ctx.project_id,
        home_node_id=ctx.home_node_id,
        operation=operation,
    )


def is_record_home_node(project: ProjectRecord, worker_id: str) -> bool:
    if project.home_node_id == "local":
        return True
    return project.home_node_id == worker_id


def context_from_record(
    *,
    project: ProjectRecord,
    requester_user_id: str,
    requester_username: str,
    principals: list[Principal],
    role: str,
    is_home_node: bool,
) -> ProjectContext:
    return ProjectContext(
        project_id=project.id,
        project_name=project.name,
        owner_type=project.owner_type,
        owner_id=project.owner_id,
        owner_username=project.owner_username,
        requester_user_id=requester_user_id,
        requester_username=requester_username,
        requester_principals=tuple(
            (principal.type, principal.id) for principal in principals
        ),
        effective_role=role,
        home_node_id=project.home_node_id,
        output_dir=Path(project.output_dir),
        state_dir=Path(project.state_dir),
        runtime_dir=Path(project.runtime_dir),
        is_home_node=is_home_node,
    )


class ProjectScopeResolver:
    def __init__(
        self,
        registry: ProjectRegistry,
        access: ProjectAccess,
        worker_id_provider: Callable[[], str],
    ) -> None:
        self._registry = registry
        self._access = access
        self._worker_id_provider = worker_id_provider

    async def user_id_from_requester(self, requester: RequesterIdentity) -> str:
        if requester.user_id:
            return requester.user_id
        resolved = await self._registry.resolve_user_id_by_username(requester.username)
        if not resolved:
            raise ProjectUserIdentityUnresolved
        return resolved

    async def resolve(
        self,
        *,
        requester: RequesterIdentity,
        project_id: str | None = None,
        project_name: str | None = None,
        required_role: str = "viewer",
    ) -> ProjectContext:
        requester_username = requester.username
        requester_user_id = await self.user_id_from_requester(requester)
        if not requester_username:
            requester_username = (
                await self._registry.resolve_username_by_user_id(requester_user_id)
                or ""
            )
        principals = await self._access.resolve_requester_principals(requester_user_id)

        project = None
        if project_id:
            project = await self._registry.get_project(project_id)
        elif project_name:
            project = await self._registry.get_project_by_owner_name(
                requester_user_id,
                project_name,
            )
        if project is None:
            raise ProjectNotFound

        role = await self._access.effective_project_role(project, principals)
        require_role_value(role, required_role)
        return context_from_record(
            project=project,
            requester_user_id=requester_user_id,
            requester_username=requester_username,
            principals=principals,
            role=role or "",
            is_home_node=is_record_home_node(
                project,
                self._worker_id_provider(),
            ),
        )

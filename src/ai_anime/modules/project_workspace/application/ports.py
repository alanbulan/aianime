"""Ports required by Project Workspace application services."""

from __future__ import annotations

from typing import Protocol

from ai_anime.modules.project_workspace.domain import Principal, ProjectRecord


class ProjectRegistry(Protocol):
    async def get_project(self, project_id: str) -> ProjectRecord | None: ...

    async def get_project_by_owner_name(
        self,
        owner_user_id: str,
        name: str,
    ) -> ProjectRecord | None: ...

    async def create_project(
        self,
        *,
        owner_user_id: str,
        owner_username: str,
        name: str,
        home_node_id: str | None = None,
        output_dir: str | None = None,
        state_dir: str | None = None,
        runtime_dir: str | None = None,
    ) -> ProjectRecord: ...

    async def list_accessible_projects(
        self,
        principals: list[tuple[str, str]],
    ) -> list[ProjectRecord]: ...

    async def update_project_status(
        self,
        project_id: str,
        status: str,
    ) -> ProjectRecord | None: ...

    async def mark_project_purged(self, project_id: str) -> ProjectRecord | None: ...

    async def delete_uncommitted_project(self, project_id: str) -> None: ...

    async def delete_project_home(self, project_id: str) -> None: ...

    async def resolve_username_by_user_id(self, user_id: str) -> str | None: ...

    async def resolve_user_id_by_username(self, username: str) -> str | None: ...


class ProjectAccess(Protocol):
    async def resolve_requester_principals(self, user_id: str) -> list[Principal]: ...

    async def effective_project_role(
        self,
        project: ProjectRecord,
        principals: list[Principal],
    ) -> str | None: ...

    async def count_project_task_eligible_users(
        self,
        *,
        project_id: str,
        owner_type: str,
        owner_id: str,
    ) -> int: ...

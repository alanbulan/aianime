"""Project listing, provisioning, and lifecycle use cases."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable

from ai_anime.modules.project_workspace.application.dto import (
    AccessibleProject,
    ProjectSummaryData,
    RequesterIdentity,
)
from ai_anime.modules.project_workspace.application.errors import (
    InvalidProjectName,
    ProjectLifecycleConflict,
    ProjectNotFound,
)
from ai_anime.modules.project_workspace.application.ports import (
    ProjectAccess,
    ProjectAudit,
    ProjectRegistry,
    ProjectWorkspaceStorage,
)
from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    ProjectScopeResolver,
    require_project_home_node,
)
from ai_anime.modules.project_workspace.domain import (
    ProjectLifecycleAction,
    ProjectRecord,
)

logger = logging.getLogger("ai_anime.project_workspace")
PROJECT_NAME_RE = re.compile(r"^\w+$", re.UNICODE)


def validate_project_name(name: str) -> None:
    if not name or not PROJECT_NAME_RE.fullmatch(name):
        raise InvalidProjectName(
            "Project name must contain only letters, digits, and underscores"
        )
    if name.startswith("_"):
        raise InvalidProjectName("Project name must not start with underscore")


class ProjectWorkspaces:
    def __init__(
        self,
        *,
        registry: ProjectRegistry,
        access: ProjectAccess,
        resolver: ProjectScopeResolver,
        storage: ProjectWorkspaceStorage,
        audit: ProjectAudit,
        now: Callable[[], str],
    ) -> None:
        self._registry = registry
        self._access = access
        self._resolver = resolver
        self._storage = storage
        self._audit = audit
        self._now = now

    async def list_accessible(
        self,
        requester: RequesterIdentity,
    ) -> list[AccessibleProject]:
        user_id = await self._resolver.user_id_from_requester(requester)
        principals = await self._access.resolve_requester_principals(user_id)
        records = await self._registry.list_accessible_projects(
            [(principal.type, principal.id) for principal in principals]
        )
        records = [record for record in records if not record.purged_at]
        items: list[AccessibleProject] = []
        for record in records:
            role = await self._access.effective_project_role(record, principals)
            items.append(
                AccessibleProject(
                    id=record.id,
                    name=record.name,
                    owner_username=record.owner_username,
                    owner_type=record.owner_type,
                    owner_id=record.owner_id,
                    effective_role=role or "",
                    home_node_id=record.home_node_id,
                    status=record.status,
                )
            )
        return items

    async def list_summaries(
        self,
        requester: RequesterIdentity,
        *,
        status: str,
    ) -> list[ProjectSummaryData]:
        user_id = await self._resolver.user_id_from_requester(requester)
        principals = await self._access.resolve_requester_principals(user_id)
        records = await self._registry.list_accessible_projects(
            [(principal.type, principal.id) for principal in principals]
        )
        summaries = [
            self._storage.summarize(
                record,
                effective_role=(
                    await self._access.effective_project_role(record, principals) or ""
                ),
            )
            for record in records
            if not record.purged_at
        ]
        if status == "visible":
            return [summary for summary in summaries if summary.status != "deleted"]
        if status == "all":
            return summaries
        return [summary for summary in summaries if summary.status == status]

    async def create(
        self,
        requester: RequesterIdentity,
        *,
        name: str,
    ) -> ProjectRecord:
        validate_project_name(name)
        user_id = await self._resolver.user_id_from_requester(requester)
        record = await self._registry.create_project(
            owner_user_id=user_id,
            owner_username=requester.username,
            name=name,
        )
        try:
            self._storage.initialize(record, username=record.owner_username)
        except Exception:
            try:
                await self._registry.delete_uncommitted_project(record.id)
            except Exception:
                logger.warning(
                    "failed to compensate uncommitted project registry row",
                    exc_info=True,
                )
            try:
                self._storage.cleanup_uncommitted(record)
            except Exception:
                logger.warning(
                    "failed to cleanup uncommitted project directories",
                    exc_info=True,
                )
            raise
        return record

    async def details(
        self,
        requester: RequesterIdentity,
        *,
        project_id: str,
    ) -> dict:
        ctx = await self._resolver.resolve(
            requester=requester,
            project_id=project_id,
            required_role="viewer",
        )
        require_project_home_node(ctx, operation="read project config")
        record = await self._registry.get_project(ctx.project_id)
        data = dict(self._storage.load_config(ctx))
        data.update(
            {
                "project_id": ctx.project_id,
                "name": ctx.project_name,
                "owner_username": ctx.owner_username,
                "effective_role": ctx.effective_role,
                "home_node_id": ctx.home_node_id,
                "status": record.status if record is not None else "active",
                "purged_at": record.purged_at if record is not None else None,
            }
        )
        return data

    async def change_status(
        self,
        requester: RequesterIdentity,
        *,
        project_id: str,
        action: ProjectLifecycleAction,
    ) -> ProjectSummaryData:
        ctx = await self._resolver.resolve(
            requester=requester,
            project_id=project_id,
            required_role="owner",
        )
        require_project_home_node(ctx, operation="update project status")
        existing = await self._registry.get_project(ctx.project_id)
        if existing is not None and existing.purged_at:
            message = (
                "Purged projects cannot be restored."
                if action is ProjectLifecycleAction.RESTORE
                else "Purged projects cannot change status."
            )
            raise ProjectLifecycleConflict(message)
        record = await self._registry.update_project_status(
            ctx.project_id,
            action.status,
        )
        if record is None:
            existing = await self._registry.get_project(ctx.project_id)
            if existing is not None and existing.purged_at:
                message = (
                    "Purged projects cannot be restored."
                    if action is ProjectLifecycleAction.RESTORE
                    else "Purged projects cannot change status."
                )
                raise ProjectLifecycleConflict(message)
            raise ProjectNotFound

        if action is ProjectLifecycleAction.ARCHIVE:
            updates = {"archived_at": self._now(), "deleted_at": ""}
        elif action is ProjectLifecycleAction.DELETE:
            updates = {"archived_at": "", "deleted_at": self._now()}
        else:
            updates = {"archived_at": "", "deleted_at": ""}
        self._storage.save_config(ctx, updates)
        summary = self._storage.summarize(
            record,
            effective_role=ctx.effective_role,
        )
        await self._audit.emit(
            action=f"project.{action.value}",
            ctx=ctx,
            metadata={"status": action.status},
        )
        return summary

    async def purge(
        self,
        requester: RequesterIdentity,
        *,
        project_id: str,
    ) -> ProjectRecord:
        ctx = await self._resolver.resolve(
            requester=requester,
            project_id=project_id,
            required_role="owner",
        )
        require_project_home_node(ctx, operation="purge project files")
        record = await self._registry.get_project(ctx.project_id)
        if record is None or record.status != "deleted":
            raise ProjectLifecycleConflict(
                "Only deleted projects can be purged. Soft-delete first."
            )
        if record.purged_at:
            raise ProjectLifecycleConflict("Project has already been purged.")
        purged = await self._registry.mark_project_purged(ctx.project_id)
        if purged is None:
            raise ProjectLifecycleConflict("Project could not be marked purged.")
        self._storage.purge_files(ctx)
        await self._registry.delete_project_home(ctx.project_id)
        await self._audit.emit(
            action="project.purge",
            ctx=ctx,
            metadata={"status": "deleted"},
        )
        return purged

    async def find_record(self, project_id: str) -> ProjectRecord | None:
        return await self._registry.get_project(project_id)

    async def count_task_eligible_users(self, ctx: ProjectContext) -> int:
        return await self._access.count_project_task_eligible_users(
            project_id=ctx.project_id,
            owner_type=ctx.owner_type,
            owner_id=ctx.owner_id,
        )

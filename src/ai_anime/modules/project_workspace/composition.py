"""Runtime composition for the Project Workspace bounded context."""

from __future__ import annotations

from datetime import datetime, timezone

from ai_anime.modules.project_workspace.application.dto import RequesterIdentity
from ai_anime.modules.project_workspace.application.project_scope import (
    ProjectContext,
    ProjectScopeResolver,
)
from ai_anime.modules.project_workspace.application.use_cases import ProjectWorkspaces
from ai_anime.modules.project_workspace.application.errors import (
    ProjectBackendNotInitialized,
)
from ai_anime.modules.project_workspace.infrastructure.workspace_storage import (
    LocalProjectWorkspaceStorage,
    PortProjectAudit,
)
from ai_anime.ports.audit import AuditSink
from ai_anime.ports.registry import PortNotRegistered, get_port
from ai_anime.shared.node_identity import resolve_worker_id


def _ports():
    try:
        return get_port("project_registry"), get_port("project_access")
    except PortNotRegistered:
        raise ProjectBackendNotInitialized from None


def _audit_sink() -> AuditSink:
    try:
        return get_port("audit_sink")
    except PortNotRegistered:
        raise ProjectBackendNotInitialized from None


def _resolver() -> ProjectScopeResolver:
    registry, access = _ports()
    return ProjectScopeResolver(registry, access, resolve_worker_id)


def project_workspaces() -> ProjectWorkspaces:
    registry, access = _ports()
    return ProjectWorkspaces(
        registry=registry,
        access=access,
        resolver=ProjectScopeResolver(registry, access, resolve_worker_id),
        storage=LocalProjectWorkspaceStorage(),
        audit=PortProjectAudit(_audit_sink()),
        now=lambda: datetime.now(timezone.utc).isoformat(),
    )


async def resolve_project_context(
    *,
    requester: RequesterIdentity,
    project_id: str | None = None,
    project_name: str | None = None,
    required_role: str = "viewer",
) -> ProjectContext:
    return await _resolver().resolve(
        requester=requester,
        project_id=project_id,
        project_name=project_name,
        required_role=required_role,
    )

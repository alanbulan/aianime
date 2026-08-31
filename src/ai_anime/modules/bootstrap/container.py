"""Explicit runtime dependencies backed by the legacy port registry."""

from __future__ import annotations

from dataclasses import dataclass

from ai_anime.modules.identity_access.public import AuthPort, AuthSessionPort
from ai_anime.modules.project_workspace.public import ProjectAccess, ProjectRegistry
from ai_anime.shared.ports.audit import AuditSink
from ai_anime.shared.ports.lifecycle import LifecyclePort
from ai_anime.shared.ports.registry import ensure_bootstrap, get_port
from ai_anime.modules.task_execution.public import CancellationStore, TaskBackend


@dataclass(frozen=True)
class ApplicationContainer:
    """Required process-level ports selected by the composition root."""

    auth: AuthPort
    auth_session: AuthSessionPort
    project_registry: ProjectRegistry
    project_access: ProjectAccess
    audit_sink: AuditSink
    task_backend: TaskBackend
    cancellation_store: CancellationStore
    lifecycle: LifecyclePort


def build_application_container() -> ApplicationContainer:
    """Bootstrap CE/EE adapters, then freeze the required port selection."""
    ensure_bootstrap()
    return ApplicationContainer(
        auth=get_port("auth"),
        auth_session=get_port("auth_session"),
        project_registry=get_port("project_registry"),
        project_access=get_port("project_access"),
        audit_sink=get_port("audit_sink"),
        task_backend=get_port("task_backend"),
        cancellation_store=get_port("cancellation_store"),
        lifecycle=get_port("lifecycle"),
    )

"""Explicit runtime dependencies backed by the legacy port registry."""

from __future__ import annotations

from dataclasses import dataclass

from ai_anime.ports.audit import AuditSink
from ai_anime.modules.identity_access.public import AuthPort, AuthSessionPort
from ai_anime.ports.credit_quote import CreditQuotePort
from ai_anime.ports.lifecycle import LifecyclePort
from ai_anime.modules.project_workspace.public import ProjectAccess, ProjectRegistry
from ai_anime.ports.registry import ensure_bootstrap, get_port
from ai_anime.ports.tasks import CancellationStore, TaskBackend
from ai_anime.ports.usage import ProviderInstrumentation, UsageMeter


@dataclass(frozen=True)
class ApplicationContainer:
    """Required process-level ports selected by the composition root."""

    auth: AuthPort
    auth_session: AuthSessionPort
    project_registry: ProjectRegistry
    project_access: ProjectAccess
    audit_sink: AuditSink
    credit_quote: CreditQuotePort
    usage_meter: UsageMeter
    provider_instrumentation: ProviderInstrumentation
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
        credit_quote=get_port("credit_quote"),
        usage_meter=get_port("usage_meter"),
        provider_instrumentation=get_port("provider_instrumentation"),
        task_backend=get_port("task_backend"),
        cancellation_store=get_port("cancellation_store"),
        lifecycle=get_port("lifecycle"),
    )

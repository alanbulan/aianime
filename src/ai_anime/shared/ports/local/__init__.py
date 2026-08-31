"""Local CE port registration."""

from __future__ import annotations

from ai_anime.modules.identity_access.public import build_local_identity_adapters
from ai_anime.modules.project_workspace.public import build_local_project_adapters
from ai_anime.modules.task_execution.public import (
    build_in_memory_cancellation_store,
    build_inline_task_backend,
)
from ai_anime.shared.ports.local.audit import NoOpAuditSink
from ai_anime.shared.ports.local.lifecycle import NoOpLifecycle
from ai_anime.shared.ports.registry import register_port


def register_local_ports() -> None:
    auth, auth_session = build_local_identity_adapters()
    project_registry, project_access = build_local_project_adapters()
    register_port("auth", auth)
    register_port("auth_session", auth_session)
    register_port("project_registry", project_registry)
    register_port("project_access", project_access)
    register_port("task_backend", build_inline_task_backend())
    register_port("cancellation_store", build_in_memory_cancellation_store())
    register_port("audit_sink", NoOpAuditSink())
    register_port("lifecycle", NoOpLifecycle())

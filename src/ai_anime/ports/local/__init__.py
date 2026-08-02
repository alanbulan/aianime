"""Local CE port registration."""

from __future__ import annotations

import os

from ai_anime.modules.identity_access.public import build_local_identity_adapters
from ai_anime.modules.model_usage.public import (
    build_local_credit_quote,
    build_local_usage_adapters,
)
from ai_anime.modules.platform_release.public import build_local_release_feed
from ai_anime.modules.project_workspace.public import build_local_project_adapters
from ai_anime.modules.task_execution.public import (
    build_in_memory_cancellation_store,
    build_inline_task_backend,
    build_mock_cloud_task_backend,
)
from ai_anime.ports.local.audit import NoOpAuditSink
from ai_anime.ports.local.lifecycle import NoOpLifecycle
from ai_anime.ports.registry import register_port


def register_local_ports() -> None:
    cloud_adapter_name = os.environ.get("AI_ANIME_CLOUD_ADAPTER", "").strip().lower()
    release_feed_name = (
        os.environ.get("AI_ANIME_RELEASE_FEED_ADAPTER", "mock").strip().lower()
    )
    auth, auth_session = build_local_identity_adapters()
    project_registry, project_access = build_local_project_adapters()
    usage_meter, provider_instrumentation = build_local_usage_adapters()
    register_port("auth", auth)
    register_port("auth_session", auth_session)
    register_port("project_registry", project_registry)
    register_port("project_access", project_access)
    register_port("usage_meter", usage_meter)
    register_port("provider_instrumentation", provider_instrumentation)
    register_port("credit_quote", build_local_credit_quote())
    register_port(
        "release_feed",
        build_local_release_feed(release_feed_name),
    )
    if cloud_adapter_name == "mock":
        register_port("task_backend", build_mock_cloud_task_backend())
    else:
        register_port("task_backend", build_inline_task_backend())
    register_port("cancellation_store", build_in_memory_cancellation_store())
    register_port("audit_sink", NoOpAuditSink())
    register_port("lifecycle", NoOpLifecycle())
    provider_instrumentation.install()

"""Local CE port registration."""

from __future__ import annotations

import os

from ai_anime.modules.identity_access.public import build_local_identity_adapters
from ai_anime.modules.project_workspace.public import build_local_project_adapters
from ai_anime.ports.local.audit import NoOpAuditSink
from ai_anime.ports.local.credit_quote import LocalCreditQuote
from ai_anime.ports.local.lifecycle import NoOpLifecycle
from ai_anime.ports.local.mock_cloud import MockCloudAdapter
from ai_anime.ports.local.mock_tasks import MockCloudTaskBackend
from ai_anime.ports.local.release_feed import MockReleaseFeed, NoOpReleaseFeed
from ai_anime.ports.local.tasks import InlineTaskBackend, InMemoryCancellationStore
from ai_anime.ports.local.usage import NoOpProviderInstrumentation, NoOpUsageMeter
from ai_anime.ports.registry import get_port, register_port


def register_local_ports() -> None:
    cloud_adapter_name = os.environ.get("AI_ANIME_CLOUD_ADAPTER", "").strip().lower()
    cloud_adapter = MockCloudAdapter() if cloud_adapter_name == "mock" else None
    release_feed_name = (
        os.environ.get("AI_ANIME_RELEASE_FEED_ADAPTER", "mock").strip().lower()
    )
    auth, auth_session = build_local_identity_adapters()
    project_registry, project_access = build_local_project_adapters()
    register_port("auth", auth)
    register_port("auth_session", auth_session)
    register_port("project_registry", project_registry)
    register_port("project_access", project_access)
    register_port("usage_meter", NoOpUsageMeter())
    register_port("provider_instrumentation", NoOpProviderInstrumentation())
    register_port("credit_quote", LocalCreditQuote())
    register_port(
        "release_feed",
        MockReleaseFeed() if release_feed_name == "mock" else NoOpReleaseFeed(),
    )
    if cloud_adapter is not None:
        register_port("cloud_adapter", cloud_adapter)
        register_port("task_backend", MockCloudTaskBackend(cloud_adapter))
    else:
        register_port("task_backend", InlineTaskBackend())
    register_port("cancellation_store", InMemoryCancellationStore())
    register_port("audit_sink", NoOpAuditSink())
    register_port("lifecycle", NoOpLifecycle())
    get_port("provider_instrumentation").install()

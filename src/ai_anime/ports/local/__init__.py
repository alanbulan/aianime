"""Local CE port registration."""

from __future__ import annotations

import os

from ai_anime.ports.local.audit import NoOpAuditSink
from ai_anime.ports.local.auth import FileAuthPort, LocalAuthSession
from ai_anime.ports.local.credit_quote import LocalCreditQuote
from ai_anime.ports.local.lifecycle import NoOpLifecycle
from ai_anime.ports.local.mock_cloud import MockCloudAdapter
from ai_anime.ports.local.mock_tasks import MockCloudTaskBackend
from ai_anime.ports.local.project import AllowAllProjectAccess, SQLiteProjectRegistry
from ai_anime.ports.local.tasks import InlineTaskBackend, InMemoryCancellationStore
from ai_anime.ports.local.usage import NoOpProviderInstrumentation, NoOpUsageMeter
from ai_anime.ports.registry import get_port, register_port


def register_local_ports() -> None:
    cloud_adapter_name = os.environ.get("AI_ANIME_CLOUD_ADAPTER", "").strip().lower()
    cloud_adapter = MockCloudAdapter() if cloud_adapter_name == "mock" else None
    register_port("auth", FileAuthPort())
    register_port("auth_session", LocalAuthSession())
    register_port("project_registry", SQLiteProjectRegistry())
    register_port("project_access", AllowAllProjectAccess())
    register_port("usage_meter", NoOpUsageMeter())
    register_port("provider_instrumentation", NoOpProviderInstrumentation())
    register_port("credit_quote", LocalCreditQuote())
    if cloud_adapter is not None:
        register_port("cloud_adapter", cloud_adapter)
        register_port("task_backend", MockCloudTaskBackend(cloud_adapter))
    else:
        register_port("task_backend", InlineTaskBackend())
    register_port("cancellation_store", InMemoryCancellationStore())
    register_port("audit_sink", NoOpAuditSink())
    register_port("lifecycle", NoOpLifecycle())
    get_port("provider_instrumentation").install()

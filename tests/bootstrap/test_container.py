from __future__ import annotations

def test_container_captures_required_ce_ports(monkeypatch) -> None:
    import ai_anime.shared.ports.registry as registry

    registry._PORTS.clear()
    registry._BOOTSTRAPPED = False
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")

    from ai_anime.modules.bootstrap.public import build_application_container

    container = build_application_container()

    assert container.auth is registry.get_port("auth")
    assert container.auth_session is registry.get_port("auth_session")
    assert container.project_registry is registry.get_port("project_registry")
    assert container.project_access is registry.get_port("project_access")
    assert container.audit_sink is registry.get_port("audit_sink")
    assert container.credit_quote is registry.get_port("credit_quote")
    assert container.usage_meter is registry.get_port("usage_meter")
    assert container.provider_instrumentation is registry.get_port(
        "provider_instrumentation"
    )
    assert container.task_backend is registry.get_port("task_backend")
    assert container.cancellation_store is registry.get_port("cancellation_store")
    assert container.lifecycle is registry.get_port("lifecycle")


def test_container_uses_registered_test_adapter(monkeypatch) -> None:
    import ai_anime.shared.ports.registry as registry

    registry._PORTS.clear()
    registry._BOOTSTRAPPED = False
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    registry.ensure_bootstrap()
    lifecycle = object()
    registry.register_port("lifecycle", lifecycle)

    from ai_anime.modules.bootstrap.public import build_application_container

    assert build_application_container().lifecycle is lifecycle

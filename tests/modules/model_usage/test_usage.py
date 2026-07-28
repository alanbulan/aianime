from __future__ import annotations

import pytest

import ai_anime.modules.model_usage.infrastructure.registered_usage as registered_usage
from ai_anime.modules.model_usage.infrastructure import (
    NoOpProviderInstrumentation,
    NoOpUsageMeter,
)
from ai_anime.modules.model_usage.public import (
    build_local_usage_adapters,
    get_usage_meter,
)


@pytest.mark.asyncio
async def test_noop_usage_meter_matches_disabled_semantics() -> None:
    meter = NoOpUsageMeter()

    reservation = await meter.reserve_current_model_call_credit(model="gpt-test")
    await meter.refund_model_call_credit_reservation(reservation)
    await meter.bump_model_call(user_id="u1", model="gpt-test")
    meter.set_llm_usage_context("u1", project_id="proj-1", resource_kind="script")
    meter.clear_llm_usage_context()
    await meter.set_project_llm_usage_context(username="alice", project_name="demo")

    assert reservation == ""
    assert await meter.get_user_credit_balance("u1") == 0


def test_local_usage_factory_returns_disabled_adapters() -> None:
    meter, instrumentation = build_local_usage_adapters()

    assert isinstance(meter, NoOpUsageMeter)
    assert isinstance(instrumentation, NoOpProviderInstrumentation)
    instrumentation.install()
    instrumentation.install()


def test_usage_meter_returns_registered_adapter(monkeypatch) -> None:
    class RegisteredUsageMeter:
        async def reserve_current_model_call_credit(self, **_kwargs) -> str:
            return "reservation-1"

    meter = RegisteredUsageMeter()
    monkeypatch.setattr(registered_usage.registry, "get_port", lambda _name: meter)

    assert get_usage_meter() is meter


@pytest.mark.parametrize("registered", [None, object()])
def test_usage_meter_falls_back_when_adapter_is_missing_or_incomplete(
    monkeypatch,
    registered,
) -> None:
    def get_port(name: str):
        if registered is None:
            raise registered_usage.registry.PortNotRegistered(name)
        return registered

    monkeypatch.setattr(registered_usage.registry, "get_port", get_port)

    assert isinstance(get_usage_meter(), NoOpUsageMeter)


def test_usage_meter_does_not_hide_registry_failures(monkeypatch) -> None:
    def get_port(_name: str):
        raise RuntimeError("registry failed")

    monkeypatch.setattr(registered_usage.registry, "get_port", get_port)

    with pytest.raises(RuntimeError, match="registry failed"):
        get_usage_meter()

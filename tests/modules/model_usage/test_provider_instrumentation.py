from __future__ import annotations

import asyncio
import logging

import pytest

import ai_anime.modules.model_usage.infrastructure.provider_instrumentation as provider
import ai_anime.modules.model_usage.infrastructure.runtime_context as runtime_context
from ai_anime.modules.model_usage import public


def test_runtime_context_tracks_and_clears_usage_attribution() -> None:
    metadata = {"requester_user_id": "user-1"}

    try:
        runtime_context.set_llm_usage_context(
            "user-1",
            project_id="project-1",
            resource_kind="script",
            billing_metadata=metadata,
        )
        metadata["requester_user_id"] = "changed"

        assert runtime_context.get_llm_user_context() == "user-1"
        assert runtime_context.get_project_context() == "project-1"
        assert runtime_context.get_resource_kind_context() == "script"
        assert runtime_context.get_billing_metadata_context() == {
            "requester_user_id": "user-1"
        }

        runtime_context.set_llm_usage_context("user-1", resource_kind="unknown")
        assert runtime_context.get_resource_kind_context() == ""
    finally:
        runtime_context.clear_llm_usage_context()

    assert runtime_context.get_llm_user_context() is None
    assert runtime_context.get_project_context() is None
    assert runtime_context.get_resource_kind_context() == ""
    assert runtime_context.get_billing_metadata_context() == {}


def test_public_reservation_context_restores_previous_value() -> None:
    previous = runtime_context.model_call_reservation_active()

    token = public.set_model_call_reservation_active(True)
    try:
        assert runtime_context.model_call_reservation_active() is True
    finally:
        public.reset_model_call_reservation_active(token)

    assert runtime_context.model_call_reservation_active() is previous


def test_public_provider_installer_delegates_to_infrastructure(monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        provider,
        "install_provider_instrumentation",
        lambda: calls.append("install"),
    )

    public.install_provider_instrumentation()

    assert calls == ["install"]


@pytest.mark.asyncio
async def test_provider_meter_calls_use_registered_usage_resolver(monkeypatch) -> None:
    calls: list[tuple[str, object]] = []

    class UsageMeter:
        async def reserve_current_model_call_credit(self, **kwargs) -> str:
            calls.append(("reserve", kwargs))
            return "reservation-1"

        async def refund_model_call_credit_reservation(
            self,
            reservation_id: str,
        ) -> None:
            calls.append(("refund", reservation_id))

    monkeypatch.setattr(
        provider, "resolve_registered_usage_meter", lambda: UsageMeter()
    )

    reservation_id = await provider._meter_reserve(
        model="gpt-test",
        billing_kind="text",
    )
    await provider._meter_refund(reservation_id)

    assert calls == [
        ("reserve", {"model": "gpt-test", "billing_kind": "text"}),
        ("refund", "reservation-1"),
    ]


@pytest.mark.asyncio
async def test_background_usage_callback_is_retained_until_completion() -> None:
    release = asyncio.Event()

    async def callback() -> None:
        await release.wait()

    provider._run_background_usage_callback(callback())

    tasks = tuple(provider._background_usage_tasks)
    assert len(tasks) == 1
    assert not tasks[0].done()

    release.set()
    await asyncio.gather(*tasks)
    await asyncio.sleep(0)

    assert provider._background_usage_tasks == set()


@pytest.mark.asyncio
async def test_background_usage_callback_logs_failure(caplog) -> None:
    caplog.set_level(logging.ERROR, logger=provider.logger.name)

    async def callback() -> None:
        raise RuntimeError("usage write failed")

    provider._run_background_usage_callback(callback())
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert provider._background_usage_tasks == set()
    assert "litellm background usage callback failed" in caplog.text

"""Cognee keeps startup credentials until the CE process restarts."""

import uuid
from types import SimpleNamespace

import pytest


def test_first_ce_gateway_configuration_does_not_require_restart(monkeypatch):
    from ai_anime.cognee import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", None)
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "configured")

    assert nv_config.cognee_gateway_restart_required() is False


def test_init_cognee_rejects_gateway_change_until_restart(monkeypatch):
    from ai_anime.cognee import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", "old")
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "new")

    assert nv_config.cognee_gateway_restart_required() is True
    with pytest.raises(RuntimeError, match="请重启 AI anime"):
        nv_config.init_cognee(
            text_model="cloud-text-standard",
            embedding_model="cloud-embedding-standard",
        )


def test_keyless_byok_transport_satisfies_cognee_without_forwarding_placeholder():
    from ai_anime.cognee import config as nv_config

    transport_key = nv_config._cognee_transport_api_key(
        "",
        "http://127.0.0.1:11434/v1",
    )
    args, kwargs = nv_config._strip_keyless_model_authorization(
        (),
        {
            "headers": {
                "Authorization": f"Bearer {transport_key}",
                "Content-Type": "application/json",
            }
        },
    )

    assert transport_key == "ai-anime-no-auth"
    assert args == ()
    assert kwargs["headers"] == {"Content-Type": "application/json"}


@pytest.mark.parametrize(
    "catalog_code",
    [
        "cloud-embedding-standard",
        "openai/text-embedding-3-large",
        "custom/local-embedding-model",
    ],
)
def test_cognee_transport_wrapper_preserves_the_catalog_model_code(catalog_code):
    from ai_anime.cognee import config as nv_config

    transport_model = nv_config._wrap_openai_compatible_model(catalog_code)

    assert transport_model == f"openai/{catalog_code}"
    assert nv_config._normalize_openai_compatible_model(transport_model) == (
        transport_model
    )
    assert nv_config._billing_model_name(transport_model) == catalog_code


@pytest.mark.asyncio
async def test_cognee_litellm_operations_own_stable_idempotency_keys():
    from ai_anime.cognee import config as nv_config

    calls: list[tuple[str, dict]] = []

    async def completion(*args, **kwargs):
        calls.append(("text", kwargs))
        return object()

    async def embedding(*args, **kwargs):
        calls.append(("embedding", kwargs))
        return object()

    litellm = SimpleNamespace(acompletion=completion, aembedding=embedding)
    nv_config._install_litellm_operation_idempotency(litellm)

    await litellm.acompletion(model="cloud-text")
    await litellm.aembedding(model="cloud-embedding")
    await litellm.acompletion(
        model="cloud-text",
        extra_headers={"idempotency-key": "caller-owned", "x-trace": "trace-1"},
    )

    text_key = calls[0][1]["extra_headers"]["Idempotency-Key"]
    embedding_key = calls[1][1]["extra_headers"]["Idempotency-Key"]
    assert str(uuid.UUID(text_key)) == text_key
    assert str(uuid.UUID(embedding_key)) == embedding_key
    assert text_key != embedding_key
    assert calls[2][1]["extra_headers"] == {
        "idempotency-key": "caller-owned",
        "x-trace": "trace-1",
    }

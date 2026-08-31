"""Cognee runtime compatibility and gateway refresh behavior."""

import asyncio
import os
import uuid
from types import SimpleNamespace

import pytest


def test_embedding_dimension_contract_is_sent_to_gateway():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    kwargs = {"dimensions": 4096}

    expected = nv_config._apply_embedding_dimension_contract(kwargs, 1024)

    assert expected == 1024
    assert kwargs["dimensions"] == 1024
    assert kwargs["allowed_openai_params"] == ["dimensions"]


def test_litellm_accepts_dimension_for_openai_compatible_catalog_model():
    from litellm.utils import get_optional_params_embeddings

    optional_params = get_optional_params_embeddings(
        model="embedding-qwenqwen3-vl-embedding-8b-dqev67imufeogbfb",
        dimensions=1024,
        custom_llm_provider="openai",
        allowed_openai_params=["dimensions"],
    )

    assert optional_params["dimensions"] == 1024


def test_embedding_dimension_contract_rejects_wrong_remote_vector_size():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    response = {"data": [{"embedding": [0.0] * 4096}]}

    with pytest.raises(RuntimeError, match="返回 4096 维向量"):
        nv_config._validate_embedding_dimension_contract(response, 1024)


def test_embedding_dimension_contract_accepts_matching_remote_vector_size():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    response = SimpleNamespace(
        data=[SimpleNamespace(embedding=[0.0] * 1024)],
    )

    nv_config._validate_embedding_dimension_contract(response, 1024)


@pytest.mark.asyncio
async def test_embedding_gateway_keeps_parallel_call_dimensions_isolated():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    started_dimensions: list[int] = []
    both_started = asyncio.Event()

    async def original_aembedding(*_args, **kwargs):
        dimensions = int(kwargs["dimensions"])
        assert kwargs["allowed_openai_params"] == ["dimensions"]
        started_dimensions.append(dimensions)
        if len(started_dimensions) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        return SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.0] * dimensions)],
        )

    async def call_with_dimensions(dimensions: int) -> int:
        context = {
            "dimensions": dimensions,
            "headers": {},
            "request_id": "",
            "response_id": "",
        }
        token = nv_config._embedding_gateway_call_context.set(context)
        try:
            response = await nv_config._call_cognee_embedding_gateway(
                original_aembedding,
                (),
                {
                    "model": "cloud-embedding",
                    "input": ["content"],
                    "dimensions": 4096,
                },
            )
            return len(response.data[0].embedding)
        finally:
            nv_config._embedding_gateway_call_context.reset(token)

    actual_dimensions = await asyncio.gather(
        call_with_dimensions(1024),
        call_with_dimensions(2048),
    )

    assert sorted(started_dimensions) == [1024, 2048]
    assert sorted(actual_dimensions) == [1024, 2048]


@pytest.mark.skipif(os.name != "nt", reason="Ladybug Unicode path issue is Windows-only")
def test_ladybug_native_binding_supports_chinese_project_paths(tmp_path):
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config
    from cognee.infrastructure.databases.graph.kuzu.subprocess.proxy import (
        RemoteKuzuDatabase,
    )
    from ladybug import Connection, Database

    nv_config._install_ladybug_windows_path_compatibility()
    database_path = tmp_path / "中文项目" / "graph.pkl"
    database_path.parent.mkdir(parents=True)

    database = Database(str(database_path))
    connection = Connection(database)
    try:
        result = connection.execute("RETURN 1 AS value")
        assert result.get_next()[0] == 1
    finally:
        connection.close()
        database.close()

    assert database.database_path == str(database_path)
    assert database_path.is_file()

    requests = []

    class FakeSession:
        def call(self, request):
            requests.append(request)
            return SimpleNamespace(new_handle_id=1)

        def add_replay_step(self, _step):
            return None

    RemoteKuzuDatabase(
        FakeSession(),
        db_path=str(database_path),
        buffer_pool_size=1024,
        max_num_threads=1,
        max_db_size=1024 * 1024,
    )

    assert requests
    assert requests[0].kwargs["database_path"] == str(database_path).encode("mbcs")


def test_first_ce_gateway_configuration_does_not_require_restart(monkeypatch):
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", None)
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "configured")

    assert nv_config.cognee_gateway_restart_required() is False


def test_init_cognee_rejects_gateway_change_until_restart(monkeypatch):
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    monkeypatch.setattr(nv_config, "_active_gateway_fingerprint", "old")
    monkeypatch.setattr(nv_config, "_current_gateway_fingerprint", lambda: "new")

    assert nv_config.cognee_gateway_restart_required() is True
    with pytest.raises(RuntimeError, match="请重启 AI anime"):
        nv_config.init_cognee()


def test_keyless_byok_transport_satisfies_cognee_without_forwarding_placeholder():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

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
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

    transport_model = nv_config._wrap_openai_compatible_model(catalog_code)

    assert transport_model == f"openai/{catalog_code}"
    assert nv_config._normalize_openai_compatible_model(transport_model) == (
        transport_model
    )


@pytest.mark.asyncio
async def test_cognee_litellm_operations_own_stable_idempotency_keys():
    from ai_anime.modules.knowledge_graph.infrastructure import config as nv_config

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

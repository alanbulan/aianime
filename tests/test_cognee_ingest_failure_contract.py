from __future__ import annotations

from types import SimpleNamespace

import pytest


class _FakePipelineStatus:
    value = "ERRORED"


class _FakeCompletedPipelineStatus:
    value = "COMPLETED"


def test_cognee_pipeline_error_result_raises_runtime_error():
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    result = SimpleNamespace(
        status=_FakePipelineStatus(),
        payload="LLM provider rejected the request",
    )

    with pytest.raises(RuntimeError, match="知识图谱构建失败"):
        CogneeStore._ensure_pipeline_run_succeeded(result, "知识图谱构建")


def test_cognee_pipeline_error_includes_nested_data_item_error():
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    result = SimpleNamespace(
        status=_FakePipelineStatus(),
        payload="Pipeline run failed. Data item could not be processed.",
        data_ingestion_info=[
            {
                "run_info": SimpleNamespace(
                    status=_FakePipelineStatus(),
                    payload="Provider rejected chunk 7: context length exceeded",
                )
            }
        ],
    )

    with pytest.raises(RuntimeError) as exc_info:
        CogneeStore._ensure_pipeline_run_succeeded(result, "知识图谱构建")

    message = str(exc_info.value)
    assert "知识图谱构建失败" in message
    assert "Provider rejected chunk 7" in message


@pytest.mark.asyncio
async def test_failed_graph_build_leaves_project_unimported(tmp_path, monkeypatch):
    """A failed ingest must not persist novel content.

    Regression: novel content was saved at Step 1 (before the graph build that
    can fail), so a failed cognify still left ``load_novel_content()`` returning
    text — and the UI inferred "导入完成" from that. A failure must leave the
    project un-imported so the user can retry.
    """
    from ai_anime.modules.knowledge_graph.infrastructure import store as store_module
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    novel = tmp_path / "novel.txt"
    novel.write_text("第一章\n春深不见旧门红，内容内容内容。\n", encoding="utf-8")

    store = object.__new__(CogneeStore)
    store.dataset_name = "test_ds"
    store.text_model = "test-text-model"
    store.embedding_model = "test-embedding-model"
    store.embedding_dimensions = 1024
    saved: dict[str, str] = {}
    monkeypatch.setattr(
        store, "save_novel_content", lambda content: saved.__setitem__("content", content)
    )
    monkeypatch.setattr(store, "load_novel_content", lambda: saved.get("content"))
    monkeypatch.setattr(store, "_set_cognee_context", lambda *a, **k: None)
    monkeypatch.setattr(store_module, "init_cognee", lambda *a, **k: None)
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    async def fake_add(*a, **k):
        return None

    monkeypatch.setattr(store_module.cognee, "add", fake_add)

    async def fail_graph(*a, **k):
        raise RuntimeError("知识图谱构建失败(PipelineRunErrored)")

    monkeypatch.setattr(store, "_run_cognee_pipeline_with_retry", fail_graph)

    with pytest.raises(RuntimeError, match="知识图谱构建失败"):
        await store.ingest_novel_fast(str(novel), rebuild=False)

    assert store.load_novel_content() is None


@pytest.mark.asyncio
async def test_successful_ingest_persists_novel_content(tmp_path, monkeypatch):
    """A successful ingest must persist novel content (导入完成)."""
    from ai_anime.modules.knowledge_graph.infrastructure import store as store_module
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    text = "第一章\n春深不见旧门红，内容内容内容。\n"
    novel = tmp_path / "novel.txt"
    novel.write_text(text, encoding="utf-8")

    store = object.__new__(CogneeStore)
    store.dataset_name = "test_ds"
    store.text_model = "test-text-model"
    store.embedding_model = "test-embedding-model"
    store.embedding_dimensions = 1024
    saved: dict[str, str] = {}
    monkeypatch.setattr(
        store, "save_novel_content", lambda content: saved.__setitem__("content", content)
    )
    monkeypatch.setattr(store, "load_novel_content", lambda: saved.get("content"))
    monkeypatch.setattr(store, "_set_cognee_context", lambda *a, **k: None)
    monkeypatch.setattr(store_module, "init_cognee", lambda *a, **k: None)
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    async def fake_add(*a, **k):
        return None

    monkeypatch.setattr(store_module.cognee, "add", fake_add)

    async def ok_graph(*a, **k):
        return None

    monkeypatch.setattr(store, "_run_cognee_pipeline_with_retry", ok_graph)

    result = await store.ingest_novel_fast(str(novel), rebuild=False)

    assert store.load_novel_content() == text
    assert result["status"] == "graph_ready"


@pytest.mark.asyncio
async def test_ingest_limits_cognee_cloud_batches(tmp_path, monkeypatch):
    from ai_anime.modules.knowledge_graph.infrastructure import store as store_module
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    novel = tmp_path / "novel.txt"
    novel.write_text("第一章\n春深不见旧门红。\n", encoding="utf-8")

    store = object.__new__(CogneeStore)
    store.dataset_name = "test_ds"
    store.text_model = "test-text-model"
    store.embedding_model = "test-embedding-model"
    store.embedding_dimensions = 1024
    monkeypatch.setattr(store, "save_novel_content", lambda _content: None)
    monkeypatch.setattr(store, "_set_cognee_context", lambda *a, **k: None)
    monkeypatch.setattr(store_module, "init_cognee", lambda *a, **k: None)

    async def fake_add(*_args, **_kwargs):
        return None

    cognify_kwargs: dict = {}

    async def fake_cognify(*_args, **kwargs):
        cognify_kwargs.update(kwargs)
        return SimpleNamespace(status=_FakeCompletedPipelineStatus(), payload=None)

    async def fake_memify(*_args, **_kwargs):
        return SimpleNamespace(status=_FakeCompletedPipelineStatus(), payload=None)

    monkeypatch.setattr(store_module.cognee, "add", fake_add)
    monkeypatch.setattr(store_module.cognee, "cognify", fake_cognify)
    monkeypatch.setattr(store_module.cognee, "memify", fake_memify)

    await store.ingest_novel_fast(str(novel), rebuild=False)

    assert cognify_kwargs["chunks_per_batch"] == 1
    assert cognify_kwargs["data_per_batch"] == 1


@pytest.mark.asyncio
async def test_cognee_pipeline_runs_successful_operation_once(monkeypatch):
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    store = object.__new__(CogneeStore)
    context_calls = 0

    def count_context():
        nonlocal context_calls
        context_calls += 1

    monkeypatch.setattr(store, "_set_cognee_context", count_context)
    attempts = 0
    logs: list[str] = []

    async def operation():
        nonlocal attempts
        attempts += 1
        return SimpleNamespace(status=_FakeCompletedPipelineStatus(), payload=None)

    await store._run_cognee_pipeline_with_retry(
        stage_name="知识图谱构建",
        operation=operation,
        log=logs.append,
    )

    assert attempts == 1
    assert context_calls == 1
    assert logs == []


@pytest.mark.asyncio
async def test_cognee_pipeline_failure_is_not_blindly_replayed(monkeypatch):
    from ai_anime.modules.knowledge_graph.infrastructure.store import CogneeStore

    store = object.__new__(CogneeStore)
    context_calls = 0

    def count_context():
        nonlocal context_calls
        context_calls += 1

    monkeypatch.setattr(store, "_set_cognee_context", count_context)
    attempts = 0
    logs: list[str] = []

    async def operation():
        nonlocal attempts
        attempts += 1
        return SimpleNamespace(status=_FakePipelineStatus(), payload=f"provider error {attempts}")

    with pytest.raises(RuntimeError) as exc_info:
        await store._run_cognee_pipeline_with_retry(
            stage_name="知识图谱构建",
            operation=operation,
            log=logs.append,
        )

    assert attempts == 1
    assert context_calls == 1
    assert "provider error 1" in str(exc_info.value)
    assert logs == []

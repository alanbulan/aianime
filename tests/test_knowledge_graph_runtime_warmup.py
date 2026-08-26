import pytest


@pytest.mark.asyncio
async def test_cognee_runtime_import_runs_off_the_event_loop(monkeypatch):
    from ai_anime.shared.infrastructure import project_stores

    marker = object()
    calls = []

    def fake_import():
        calls.append("import")
        return marker

    async def fake_to_thread(operation):
        calls.append("to_thread")
        return operation()

    monkeypatch.setattr(project_stores, "_import_cognee_store_class", fake_import)
    monkeypatch.setattr(project_stores.asyncio, "to_thread", fake_to_thread)

    assert await project_stores.load_cognee_store_class() is marker
    assert calls == ["to_thread", "import"]


@pytest.mark.asyncio
async def test_cognee_runtime_prewarm_is_best_effort(monkeypatch):
    from ai_anime.shared.infrastructure import project_stores

    async def fail_import():
        raise RuntimeError("unavailable")

    monkeypatch.setattr(project_stores, "load_cognee_store_class", fail_import)

    await project_stores.prewarm_knowledge_graph_runtime()

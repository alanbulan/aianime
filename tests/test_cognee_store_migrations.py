import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_cognee_storage_migrates_once_per_project_before_setup(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.knowledge_graph.infrastructure import store as store_module

    calls: list[str] = []
    store = store_module.CogneeStore.__new__(store_module.CogneeStore)
    store.state_dir = str(tmp_path / "state")
    store._set_cognee_context = lambda verbose=False: calls.append(
        f"context:{verbose}"
    )

    async def migrate(target: str) -> list[dict]:
        calls.append(f"migrate:{target}")
        return []

    async def setup() -> None:
        calls.append("setup")

    monkeypatch.setattr(store_module, "apply_all_migrations", migrate)
    monkeypatch.setattr(store_module, "setup", setup)

    await store._initialize_cognee_storage()
    await store._initialize_cognee_storage()

    assert calls == [
        "context:True",
        "migrate:head",
        "setup",
        "context:True",
        "setup",
    ]


def test_cognee_storage_initialization_serializes_concurrent_event_loops(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.knowledge_graph.infrastructure import store as store_module

    counter_lock = threading.Lock()
    start_barrier = threading.Barrier(2)
    active_migrations = 0
    maximum_active_migrations = 0

    async def migrate(_target: str) -> list[dict]:
        nonlocal active_migrations, maximum_active_migrations
        with counter_lock:
            active_migrations += 1
            maximum_active_migrations = max(
                maximum_active_migrations,
                active_migrations,
            )
        await asyncio.sleep(0.05)
        with counter_lock:
            active_migrations -= 1
        return []

    async def setup() -> None:
        return None

    def make_store(name: str):
        store = store_module.CogneeStore.__new__(store_module.CogneeStore)
        store.state_dir = str(tmp_path / name)
        store._set_cognee_context = lambda verbose=False: None
        return store

    def initialize(store) -> None:
        start_barrier.wait(timeout=2)
        asyncio.run(store._initialize_cognee_storage())

    monkeypatch.setattr(store_module, "apply_all_migrations", migrate)
    monkeypatch.setattr(store_module, "setup", setup)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(initialize, make_store("state-a")),
            executor.submit(initialize, make_store("state-b")),
        ]
        for future in futures:
            future.result(timeout=5)

    assert maximum_active_migrations == 1

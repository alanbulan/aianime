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

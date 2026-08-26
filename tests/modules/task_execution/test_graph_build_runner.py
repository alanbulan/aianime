from types import SimpleNamespace

import pytest

from ai_anime.modules.task_execution.infrastructure.runners import graph_build


@pytest.mark.asyncio
async def test_build_characters_zero_output_is_retryable_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Store:
        closed = False

        async def build_characters_from_graph(self, **_kwargs):
            return []

        async def close(self):
            self.closed = True

    store = _Store()
    monkeypatch.setattr(graph_build, "require_imported_story", lambda _path: "novel.md")

    async def load_store(_context):
        return store

    monkeypatch.setattr(graph_build, "_load_store", load_store)

    with pytest.raises(RuntimeError, match="角色提取没有产出可用角色"):
        await graph_build._run_build_characters(
            SimpleNamespace(output_dir="project-output")
        )

    assert store.closed is True

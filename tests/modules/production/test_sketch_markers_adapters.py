from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure.sketch_markers import (
    SqliteProductionSketchMarkerWorkspace,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="owner-1",
        owner_username="alice",
        requester_user_id="user-1",
        requester_username="alice",
        requester_principals=(("user", "user-1"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_sqlite_sketch_marker_workspace_closes_store_after_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import sketch_markers

    context = _context(tmp_path)
    store = _Store()

    async def make_store(candidate):
        assert candidate is context
        return store

    monkeypatch.setattr(
        sketch_markers.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )

    with pytest.raises(RuntimeError, match="failed"):
        async with SqliteProductionSketchMarkerWorkspace().session(context) as opened:
            assert opened is store
            raise RuntimeError("failed")

    assert store.close_calls == 1

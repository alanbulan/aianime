from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure.sketch_editing import (
    LocalProductionSketchEditingWorkspace,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class _Store:
    def __init__(self) -> None:
        self.close_calls = 0

    async def get_beats_as_dicts(self, episode_num: int):
        assert episode_num == 2
        return [{"beat_number": 5}, {"beat_number": 6}]

    def get_sketch_colors(self, episode_num: int):
        assert episode_num == 2
        return {"hero": "#00ffff"}

    async def close(self) -> None:
        self.close_calls += 1


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-sketch",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_sketch_editing_workspace_projects_target_and_closes_store(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.production.infrastructure import sketch_editing

    context = _context(tmp_path)
    sketch_path = Path(context.output_dir) / "sketches" / "ep002" / "beat_05.png"
    sketch_path.parent.mkdir(parents=True)
    sketch_path.write_bytes(b"sketch")
    store = _Store()

    async def make_store(candidate):
        assert candidate is context
        return store

    monkeypatch.setattr(
        sketch_editing.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    workspace = LocalProductionSketchEditingWorkspace(
        lambda _context, relative_path, local_path=None: f"/files/{relative_path}"
    )

    target = workspace.canonical_sketch(context, 2, 5)
    beat_context = await workspace.beat_context(context, 2, 5)

    assert target is not None
    assert target.path == sketch_path
    assert target.url == "/files/sketches/ep002/beat_05.png"
    assert beat_context is not None
    assert beat_context.beat == {"beat_number": 5}
    assert beat_context.sketch_colors == {"hero": "#00ffff"}
    assert store.close_calls == 1
    assert workspace.canonical_sketch(context, 2, 6) is None

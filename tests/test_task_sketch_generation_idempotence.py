from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.utils.path_resolver import PathResolver


def _context(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_sketch_runner_skips_existing_canonical_without_replace(
    monkeypatch,
    tmp_path: Path,
) -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import sketch

    class TaskManager:
        def update_progress_for_project(self, *args, **kwargs):
            return None

    monkeypatch.setattr(sketch, "get_task_manager", lambda: TaskManager())
    canonical = PathResolver(str(tmp_path), 1).sketch(1)
    canonical.parent.mkdir(parents=True, exist_ok=True)
    canonical.write_bytes(b"existing")

    result = await sketch._run_sketch_generation_async(
        {
            "episode": 1,
            "scope": "grid_0",
            "payload": {
                "output_dir": str(tmp_path),
                "config": {
                    "beats": [
                        {
                            "beat_number": 1,
                            "scene_id": "classroom",
                            "visual_description": "{{Hero_Main}}走进教室。",
                        }
                    ],
                    "grid_index": 0,
                    "sketch_scene_grouping": True,
                    "aspect_ratio": "2:3",
                    "replace_existing": False,
                },
            },
        },
        _context(tmp_path),
    )

    assert result["skipped"] is True
    assert result["beat_numbers"] == [1]
    assert result["sketch_path"] == str(canonical)

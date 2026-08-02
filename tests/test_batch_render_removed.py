from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_legacy_batch_render_route_is_removed_from_api_routes() -> None:
    routes_root = REPO_ROOT / "src/ai_anime/api/routes"
    source = "\n".join(
        path.read_text(encoding="utf-8") for path in routes_root.glob("*.py")
    )

    assert not (routes_root / "generation.py").exists()
    assert "/grids/batch-render" not in source
    assert "batch_generate_render" not in source
    assert "start_batch_render_task" not in source


def test_legacy_batch_render_ray_surface_is_removed() -> None:
    from ai_anime.modules.task_execution.public import TASK_IDENTITY_SPECS

    assert "batch_render" not in TASK_IDENTITY_SPECS
    assert importlib.util.find_spec("ai_anime.ray_tasks") is None

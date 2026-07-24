from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_render_plan_routes_are_restored_without_legacy_episode_video_route() -> None:
    generation_source = (REPO_ROOT / "src/ai_anime/api/routes/generation.py").read_text(
        encoding="utf-8"
    )
    render_source = (
        REPO_ROOT / "src/ai_anime/api/routes/production_render.py"
    ).read_text(encoding="utf-8")

    assert "/videos/generate" not in generation_source
    assert "/render/plan" in render_source
    assert "/render/execute" in render_source
    assert "RenderPlanRequest" in render_source
    assert "RenderPlanExecuteRequest" in render_source
    assert "start_render_plan_task" not in render_source


def test_legacy_video_generation_task_surface_is_removed() -> None:
    from ai_anime.task_identity import TASK_IDENTITY_SPECS

    assert "video_generation" not in TASK_IDENTITY_SPECS
    assert importlib.util.find_spec("ai_anime.ray_tasks") is None

"""Stable task scope helpers shared by API routes and tests."""

from __future__ import annotations

from ai_anime.task_identity import task_config_scope


def stage_asset_scope(scene_name: str, step: str) -> str:
    return task_config_scope("stage_asset", {"scene": scene_name, "step": step})

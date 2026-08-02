"""Task-runner adapter for character portrait and identity image assets."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.modules.asset_world.public import execute_character_image_task
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import await_envelope_with_cancel_watch
from ai_anime.modules.task_execution.public import register_project_task_runner


def run_character_image(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            execute_character_image_task(envelope, ctx),
            envelope,
            task_type=str(envelope.get("task_type") or "character_portrait"),
        )
    )


register_project_task_runner("character_portrait", run_character_image)
register_project_task_runner("identity_image", run_character_image)

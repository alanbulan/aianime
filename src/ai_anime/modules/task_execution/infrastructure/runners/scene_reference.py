"""Celery runner for canonical scene reference images."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import await_envelope_with_cancel_watch
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager


def run_scene_reference_asset(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_scene_reference_asset(envelope, ctx),
            envelope,
            task_type="scene_reference_asset",
        )
    )


async def _run_scene_reference_asset(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any] | None:
    from ai_anime.modules.production.public import IMAGE_DEFAULT_STYLE
    from ai_anime.modules.production.public import generate_scene_reference_image
    from ai_anime.shared.infrastructure.project_stores import (
        make_cognee_store_for_context,
    )

    payload = envelope.get("payload") or {}
    scene_name = str(payload["scene_name"])
    kind = str(payload["kind"])
    style = str(payload.get("style") or "")
    model = str(payload.get("model") or "").strip()
    model_selector = str(payload.get("model_selector") or "").strip()
    if not model:
        raise ValueError("场景参考图生成缺少图片模型")
    scope = envelope.get("scope")
    output_dir = Path(str(payload.get("output_dir") or ctx.output_dir))
    manager = get_task_manager()

    if kind not in {"master", "spatial_layout", "reverse_master"}:
        raise ValueError(f"Unsupported scene reference kind: {kind}")

    def update(progress: float, current_task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "scene_reference_asset",
            0,
            scope=scope,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    update(0.10, "加载场景数据...")
    store = await make_cognee_store_for_context(ctx)
    try:
        scene = await store.sqlite_store.get_scene(scene_name)
        if scene is None:
            raise RuntimeError(f"找不到场景: {scene_name}")
        base_scene = None
        base_scene_id = str(getattr(scene, "base_scene_id", "") or "").strip()
        if base_scene_id and base_scene_id != scene.name:
            base_scene = await store.sqlite_store.get_scene(base_scene_id)

        style_id = (style or IMAGE_DEFAULT_STYLE).strip() or IMAGE_DEFAULT_STYLE
        update(0.40, f"调用图像模型生成 {kind}...")
        output_path = await generate_scene_reference_image(
            project_dir=output_dir,
            scene=scene,
            kind=kind,  # type: ignore[arg-type]
            model=model,
            model_selector=model_selector or None,
            style_id=style_id,
            base_scene=base_scene,
        )
        if kind == "spatial_layout":
            rel_path = str(Path(output_path).relative_to(output_dir))
            await store.sqlite_store.update_scene(scene_name, spatial_layout_image=rel_path)
        return {
            "scene_name": scene_name,
            "kind": kind,
            "path": str(output_path),
            "style": style_id,
        }
    finally:
        await store.close()


register_project_task_runner("scene_reference_asset", run_scene_reference_asset)

"""Project task runner for custom style reference images."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager
from ai_anime.modules.task_execution.public import (
    await_envelope_with_cancel_watch,
    register_project_task_runner,
)


def run_style_preview(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_style_preview(envelope, context),
            envelope,
            task_type="style_preview",
        )
    )


def run_style_analysis(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_style_analysis(envelope, context),
            envelope,
            task_type="style_analysis",
        )
    )


async def _run_style_preview(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.asset_world.public import (
        StyleScope,
        style_catalog_use_cases,
        style_preview_use_cases,
    )

    payload = envelope.get("payload") or {}
    style_id = str(payload.get("style_id") or "").strip()
    prompt = str(payload.get("prompt") or "").strip()
    scope_key = envelope.get("scope")
    if not style_id:
        raise ValueError("风格参考图生成缺少风格 ID")

    manager = get_task_manager()

    def update(progress: float, current_task: str) -> None:
        manager.update_progress_for_project(
            context,
            "style_preview",
            0,
            scope=scope_key,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    style_scope = StyleScope(
        username=context.owner_username,
        project_name=context.project_name,
        project_dir=Path(context.output_dir),
        request_project=context.project_id,
    )
    update(0.10, "读取风格配置...")
    update(0.35, "调用图像模型生成风格参考图...")
    generated = await style_preview_use_cases().generate_preview(
        style_id=style_id,
        scope=style_scope,
        prompt=prompt,
    )
    update(0.90, "保存风格参考图...")
    style = style_catalog_use_cases().get_style(style_id, style_scope)
    return {
        "style_id": style_id,
        "preview_path": str(style.get("preview_path") or ""),
        "preview_url": str(style.get("preview_url") or ""),
        "media_type": generated.media_type,
    }


async def _run_style_analysis(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.asset_world.public import (
        AnalyzeStyleCommand,
        StyleScope,
        analyze_style,
    )

    payload = envelope.get("payload") or {}
    source_path = Path(str(payload.get("source_path") or ""))
    scope_key = envelope.get("scope")
    manager = get_task_manager()

    def update(progress: float, current_task: str) -> None:
        manager.update_progress_for_project(
            context,
            "style_analysis",
            0,
            scope=scope_key,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    staged_root = (
        Path(context.output_dir) / ".task_inputs" / "style_analysis"
    ).resolve()
    try:
        source_path = source_path.resolve(strict=True)
        source_path.relative_to(staged_root)
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise FileNotFoundError("风格分析输入图片不存在或不属于当前项目") from exc
    if not source_path.is_file():
        raise FileNotFoundError("风格分析输入图片不存在")
    style_scope = StyleScope(
        username=context.owner_username,
        project_name=context.project_name,
        project_dir=Path(context.output_dir),
        request_project=context.project_id,
    )
    update(0.10, "读取风格参考图...")
    try:
        content = source_path.read_bytes()
        update(0.25, "调用视觉模型分析风格...")
        data = await analyze_style().execute(
            AnalyzeStyleCommand(
                content=content,
                mime_type=str(payload.get("mime_type") or "image/jpeg"),
                filename=str(payload.get("filename") or source_path.name),
                style_id=str(payload.get("style_id") or ""),
            ),
            style_scope,
        )
        update(0.95, "视觉风格分析完成")
        return dict(data)
    finally:
        source_path.unlink(missing_ok=True)


register_project_task_runner("style_preview", run_style_preview)
register_project_task_runner("style_analysis", run_style_analysis)

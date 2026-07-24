"""Celery runner for screenplay generation."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    create_script_writing_workflow,
    generate_and_save_beat_video_prompt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)
from ai_anime.task_backend.cancel import await_envelope_with_cancel_watch
from ai_anime.task_backend.registry import register_project_task_runner
from ai_anime.task_state import get_task_manager


def run_script_writer(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_script_writer(envelope, ctx),
            envelope,
            task_type="script_writer",
        )
    )


def run_beat_video_prompt(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_beat_video_prompt(envelope, ctx),
            envelope,
            task_type="beat_video_prompt",
        )
    )


async def _run_beat_video_prompt(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or payload.get("beat_num") or 0)
    output_dir = str(payload.get("output_dir") or ctx.output_dir)
    language = str(payload.get("language") or "en")
    manager = get_task_manager()

    def update_progress(progress: float, task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "beat_video_prompt",
            episode,
            beat_num=beat_num,
            progress=progress,
            current_task=task,
            logs=[task],
        )

    update_progress(0.05, f"开始生成 Beat {beat_num} 视频提示词")
    store = await make_sqlite_store_for_context(ctx)
    try:
        generated = await generate_and_save_beat_video_prompt(
            store,
            output_dir=output_dir,
            project_name=ctx.project_name,
            episode_num=episode,
            beat_num=beat_num,
            language=language,
        )
        update_progress(0.95, f"已保存 Beat {beat_num} 视频提示词")
        return {
            "episode": episode,
            "beat_num": beat_num,
            "field": generated.field,
            "prompt": generated.prompt,
        }
    finally:
        await store.close()


async def _run_script_writer(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any] | None:
    from ai_anime.cognee import CogneeStore
    from ai_anime.modules.production.public import assign_identity_sketch_colors
    from ai_anime.project_config import load_project_config
    from ai_anime.utils.path_resolver import PathResolver
    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    config = dict(payload.get("config") or {})
    output_dir = str(payload.get("output_dir") or ctx.output_dir)
    manager = get_task_manager()

    def update_progress(progress: float, task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "script_writer",
            episode,
            progress=progress,
            current_task=task,
            logs=[task],
        )

    update_progress(0.02, "开始生成脚本...")

    store = CogneeStore(ctx.owner_project_label, output_dir=output_dir)
    await store.initialize()
    try:
        await store.load_graph_state()
        update_progress(0.10, "图谱状态已加载")

        project_config = load_project_config(ctx.owner_username, ctx.project_name)
        merged_config = {**project_config, **config}
        workflow = create_script_writing_workflow(
            store,
            genre=merged_config.get("genre", ""),
            story_setting=merged_config.get("story_setting", ""),
            spine_template=merged_config.get("spine_template", "drama"),
        )

        script = await workflow.run(
            episode_num=episode,
            on_progress=update_progress,
            on_log=lambda message: manager.update_progress_for_project(
                ctx,
                "script_writer",
                episode,
                logs=[message],
            ),
        )

        paths = PathResolver(output_dir, episode)
        deleted = paths.clean_sketches()
        if deleted:
            manager.update_progress_for_project(
                ctx,
                "script_writer",
                episode,
                logs=[f"已清理 {deleted} 个旧草图文件"],
            )

        try:
            char_dicts = [
                {
                    "name": c.name,
                    "identities": [
                        {"identity_id": identity.identity_id} for identity in (c.identities or [])
                    ],
                }
                for c in store.get_all_characters()
            ]
            beats_data = [beat.model_dump() for beat in script.beats]
            existing_colors = dict(store.get_sketch_colors(episode) or {})
            colors = assign_identity_sketch_colors(
                char_dicts,
                episode_beats=beats_data,
                existing_colors=existing_colors,
            )
            if colors:
                await store.set_sketch_colors(episode, colors)
                manager.update_progress_for_project(
                    ctx,
                    "script_writer",
                    episode,
                    logs=[f"已分配 {len(colors)} 个身份配色"],
                )
        except Exception as exc:  # noqa: BLE001
            manager.update_progress_for_project(
                ctx,
                "script_writer",
                episode,
                logs=[f"自动配色失败（不影响脚本）: {exc}"],
            )

        result = {
            "episode": episode,
            "beats": len(script.beats),
            "beats_data": [beat.model_dump() for beat in script.beats],
            "review_passed": workflow.last_review_passed,
            "review_summary": workflow.last_review_summary,
            "output_dir": str(Path(output_dir)),
        }
        return result
    finally:
        await store.close()


register_project_task_runner("script_writer", run_script_writer)
register_project_task_runner("beat_video_prompt", run_beat_video_prompt)

"""Celery runner for screenplay generation."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    GenerateEpisodeRewriteCommand,
    GenerateVideoPromptCommand,
    create_script_writing_workflow,
    generate_and_save_beat_video_prompt,
    generate_episode_rewrite,
    generate_optimized_video_prompt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)
from ai_anime.modules.task_execution.public import await_envelope_with_cancel_watch
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager


def run_script_writer(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_script_writer(envelope, ctx),
            envelope,
            task_type="script_writer",
        )
    )


def run_beat_video_prompt(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_beat_video_prompt(envelope, ctx),
            envelope,
            task_type="beat_video_prompt",
        )
    )


def run_video_prompt_optimization(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_video_prompt_optimization(envelope, ctx),
            envelope,
            task_type="video_prompt_optimization",
        )
    )


def run_episode_rewrite(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_episode_rewrite(envelope, ctx),
            envelope,
            task_type="episode_rewrite",
        )
    )


async def _run_beat_video_prompt(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
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


async def _run_video_prompt_optimization(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or payload.get("beat_num") or 0)
    manager = get_task_manager()

    def update_progress(progress: float, task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "video_prompt_optimization",
            episode,
            beat_num=beat_num,
            progress=progress,
            current_task=task,
            logs=[task],
        )

    update_progress(0.05, f"开始优化 Beat {beat_num} 视频提示词")
    store = await make_sqlite_store_for_context(ctx)
    try:
        generated = await generate_optimized_video_prompt(
            store,
            GenerateVideoPromptCommand(
                episode_num=episode,
                beat_num=beat_num,
                project_dir=str(payload.get("project_dir") or ctx.output_dir),
                requester_user_id=str(
                    payload.get("requester_user_id")
                    or ctx.requester_user_id
                    or ctx.requester_username
                ),
                project_id=str(payload.get("project_id") or ctx.project_id),
                manual_prompt_reference=payload.get("manual_prompt_reference"),
                prompt_guidance=payload.get("prompt_guidance"),
            ),
        )
        update_progress(0.95, f"已保存 Beat {beat_num} 视频提示词")
        return generated.as_dict()
    finally:
        await store.close()


async def _run_episode_rewrite(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    manager = get_task_manager()

    def update_progress(progress: float, task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "episode_rewrite",
            episode,
            progress=progress,
            current_task=task,
            logs=[task],
        )

    update_progress(0.05, f"开始生成第 {episode} 集改写稿")
    store = await make_sqlite_store_for_context(ctx)
    try:
        rewritten = await generate_episode_rewrite(
            store,
            GenerateEpisodeRewriteCommand(
                episode_num=episode,
                target_beats=int(payload.get("target_beats") or 18),
                beat_chars_min=int(payload.get("beat_chars_min") or 14),
                beat_chars_max=int(payload.get("beat_chars_max") or 20),
                narration_style=payload.get("narration_style"),
            ),
        )
        update_progress(0.95, f"已保存第 {episode} 集改写稿")
        return rewritten.as_dict()
    finally:
        await store.close()


async def _run_script_writer(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any] | None:
    from ai_anime.modules.project_workspace.public import load_project_config
    from ai_anime.shared.infrastructure.project_stores import (
        make_cognee_store_for_context,
    )

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

    store = await make_cognee_store_for_context(ctx, load_graph_state=True)
    try:
        update_progress(0.10, "图谱状态已加载")

        project_config = load_project_config(ctx.owner_username, ctx.project_name)
        merged_config = {**project_config, **config}
        script_mode = str(merged_config.get("script_mode") or "duration")
        project_rhythm = str(project_config.get("rhythm") or "medium")
        target_duration = float(merged_config.get("target_duration_total") or 120)
        target_beats = merged_config.get("target_beats")
        workflow = create_script_writing_workflow(
            store,
            genre=merged_config.get("genre", ""),
            story_setting=merged_config.get("story_setting", ""),
            spine_template=merged_config.get("spine_template", "drama"),
            script_mode=script_mode,
            rhythm=project_rhythm,
        )

        script = await workflow.run(
            episode_num=episode,
            target_duration=(target_duration if script_mode == "duration" else None),
            target_beats=(
                int(target_beats)
                if script_mode == "duration" and target_beats is not None
                else None
            ),
            on_progress=update_progress,
            on_log=lambda message: manager.update_progress_for_project(
                ctx,
                "script_writer",
                episode,
                logs=[message],
            ),
        )

        result = {
            "episode": episode,
            "beats": len(script.beats),
            "beats_data": [beat.model_dump() for beat in script.beats],
            "review_passed": workflow.last_review_passed,
            "review_summary": workflow.last_review_summary,
            "script_mode": script_mode,
            "target_duration_total": (
                target_duration if script_mode == "duration" else None
            ),
            "target_beats": (
                int(target_beats)
                if script_mode == "duration" and target_beats is not None
                else None
            ),
            "output_dir": str(Path(output_dir)),
        }
        return result
    finally:
        await store.close()


register_project_task_runner("script_writer", run_script_writer)
register_project_task_runner("beat_video_prompt", run_beat_video_prompt)
register_project_task_runner("video_prompt_optimization", run_video_prompt_optimization)
register_project_task_runner("episode_rewrite", run_episode_rewrite)

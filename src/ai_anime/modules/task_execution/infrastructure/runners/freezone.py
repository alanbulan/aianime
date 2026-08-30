"""Celery runners for Image Freezone jobs."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    await_envelope_with_cancel_watch,
    await_with_cancel_watch as _await_with_cancel_watch,
)
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.modules.task_execution.public import project_task_state_key
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager

_IMAGE_PROGRESS_HEARTBEAT_SECONDS = 2.0
_IMAGE_PROGRESS_ESTIMATE_SECONDS = 60.0
_IMAGE_PROGRESS_START = 0.1
_IMAGE_PROGRESS_CEILING = 0.9


def _run_cancellable(
    envelope: dict[str, Any],
    coro,
    *,
    task_type: str | None = None,
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            coro,
            envelope,
            task_type=task_type or str(envelope.get("task_type") or ""),
        )
    )


def _update(
    ctx: ProjectContext,
    task_type: str,
    scope: str,
    progress: float,
    current_task: str,
    *,
    episode: int = 0,
    append_log: bool = True,
) -> None:
    get_task_manager().update_progress_for_project(
        ctx,
        task_type,
        int(episode),
        scope=scope,
        progress=progress,
        current_task=current_task,
        logs=[current_task] if append_log else None,
    )


async def _image_progress_heartbeat(
    ctx: ProjectContext,
    task_type: str,
    scope: str,
    current_task: str,
) -> None:
    loop = asyncio.get_running_loop()
    started_at = loop.time()
    while True:
        await asyncio.sleep(_IMAGE_PROGRESS_HEARTBEAT_SECONDS)
        elapsed = max(0.0, loop.time() - started_at)
        progress = min(
            _IMAGE_PROGRESS_CEILING,
            _IMAGE_PROGRESS_START
            + (elapsed / _IMAGE_PROGRESS_ESTIMATE_SECONDS)
            * (_IMAGE_PROGRESS_CEILING - _IMAGE_PROGRESS_START),
        )
        _update(
            ctx,
            task_type,
            scope,
            progress,
            current_task,
            append_log=False,
        )


async def _await_image_with_progress(
    awaitable,
    *,
    ctx: ProjectContext,
    task_type: str,
    scope: str,
    current_task: str,
):
    heartbeat = asyncio.create_task(
        _image_progress_heartbeat(ctx, task_type, scope, current_task)
    )
    try:
        return await awaitable
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat


def _append_node_history(
    *,
    ctx: ProjectContext,
    project_dir: Path,
    payload: dict[str, Any],
    task_type: str,
    job_id: str,
    media_type: str,
    result: dict[str, Any],
    error: str | None = None,
    episode: int = 0,
    beat_num: int | None = None,
    scope: str | None = None,
    **extra: Any,
) -> dict[str, Any] | None:
    node_id = str(payload.get("node_id") or "").strip()
    if not node_id:
        return None
    from ai_anime.modules.creative_canvas.public import (
        RecordCreativeCanvasGenerationCommand,
        creative_canvas_generation_history_use_cases,
    )

    return creative_canvas_generation_history_use_cases().record(
        RecordCreativeCanvasGenerationCommand(
            project_dir=project_dir,
            canvas_id=str(payload.get("canvas_id") or "default"),
            node_id=node_id,
            task_type=task_type,
            job_id=job_id,
            task_key=project_task_state_key(
                task_type,
                ctx.project_id,
                int(episode),
                beat_num=beat_num,
                scope=scope or job_id,
            ),
            status="failed" if error else "completed",
            media_type=media_type,
            result=result,
            error=error,
            # Text/audio nodes use "input"; image nodes use "prompt".
            prompt=payload.get("prompt") or payload.get("input"),
            extra=extra,
        )
    )


def _history_model_mode_extra(payload: dict) -> dict:
    """记忆包：把生成请求里的注册表 model id / 生成模式映射到历史记录顶层字段。

    仅非空时写入，缺省省略（向后兼容，还原时回退默认）。
    """
    extra: dict[str, str] = {}
    model_id = payload.get("model_id")
    if model_id:
        extra["model"] = str(model_id)
    gen_mode = payload.get("gen_mode")
    if gen_mode:
        extra["gen_mode"] = str(gen_mode)
    return extra


async def _run_freezone_gen_async(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        GenerateCreativeCanvasImageJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    task_type = str(envelope.get("task_type") or "freezone_gen")
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, task_type, job_id, 0.1, "调用图像生成器...")
    out_path = await _await_image_with_progress(
        _await_with_cancel_watch(
            creative_canvas_job_execution_use_cases().generate_image(
                GenerateCreativeCanvasImageJobCommand(
                    project_dir=project_dir,
                    job_id=job_id,
                    prompt=str(payload.get("prompt") or ""),
                    aspect_ratio=str(payload.get("aspect_ratio") or "1:1"),
                    image_size=str(payload.get("image_size") or "2K"),
                    reference_paths=tuple(payload.get("reference_paths") or ()),
                    model=payload.get("model"),
                    model_selector=str(payload.get("model_id") or "") or None,
                    extra_params=payload.get("extra_params") or {},
                    quality=payload.get("quality"),
                    output_task_type=task_type,
                )
            ),
            project_id=ctx.project_id,
            task_type=task_type,
            episode=0,
            task_id=str(envelope.get("__run_task_id") or ""),
            scope=job_id,
        ),
        ctx=ctx,
        task_type=task_type,
        scope=job_id,
        current_task="云端正在生成图片...",
    )
    rel = out_path.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel),
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type=task_type,
        job_id=job_id,
        media_type="image",
        result=result,
        **_history_model_mode_extra(payload),
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


async def _run_freezone_edit_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        EditCreativeCanvasImageJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    task_type = str(envelope.get("task_type") or "freezone_edit")
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, task_type, job_id, 0.1, "调用图像编辑器...")
    out_path = await _await_image_with_progress(
        _await_with_cancel_watch(
            creative_canvas_job_execution_use_cases().edit_image(
                EditCreativeCanvasImageJobCommand(
                    project_dir=project_dir,
                    job_id=job_id,
                    prompt=str(payload.get("prompt") or ""),
                    base_path=str(payload["base_path"]),
                    extra_reference_paths=tuple(
                        payload.get("extra_reference_paths") or ()
                    ),
                    aspect_ratio=str(payload.get("aspect_ratio") or "1:1"),
                    image_size=str(payload.get("image_size") or "2K"),
                    model=payload.get("model"),
                    model_selector=str(payload.get("model_id") or "") or None,
                    extra_params=payload.get("extra_params") or {},
                    quality=payload.get("quality"),
                    output_task_type=task_type,
                )
            ),
            project_id=ctx.project_id,
            task_type=task_type,
            episode=0,
            task_id=str(envelope.get("__run_task_id") or ""),
            scope=job_id,
        ),
        ctx=ctx,
        task_type=task_type,
        scope=job_id,
        current_task="云端正在编辑图片...",
    )
    rel = out_path.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel),
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type=task_type,
        job_id=job_id,
        media_type="image",
        result=result,
        **_history_model_mode_extra(payload),
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


async def _run_freezone_mask_edit_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        MaskEditCreativeCanvasImageJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_mask_edit", job_id, 0.1, "调用图片擦除模型...")
    out_path = await creative_canvas_job_execution_use_cases().mask_edit_image(
        MaskEditCreativeCanvasImageJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            base_path=str(payload["base_path"]),
            mask_path=str(payload["mask_path"]),
            prompt=str(payload.get("prompt") or ""),
            aspect_ratio=str(payload.get("aspect_ratio") or "1:1"),
            image_size=str(payload.get("image_size") or "2K"),
            quality=str(payload.get("quality") or "medium"),
            model=str(payload.get("model") or ""),
            model_selector=str(payload.get("model_id") or "") or None,
        )
    )
    rel = out_path.relative_to(project_dir).as_posix()
    return {
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel),
    }


async def _run_freezone_extract_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        ExtractCreativeCanvasFramesJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_extract", job_id, 0.1, "ffmpeg 抽帧中...")
    frame_paths = await creative_canvas_job_execution_use_cases().extract_frames(
        ExtractCreativeCanvasFramesJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            video_path=Path(str(payload["video_path"])),
            max_frames=int(payload.get("max_frames") or 20),
            scene_threshold=float(payload.get("scene_threshold") or 0.3),
        )
    )
    return {
        "job_id": job_id,
        "frame_count": len(frame_paths),
        "frame_urls": [
            make_static_url_for_context(ctx, path.relative_to(project_dir).as_posix())
            for path in frame_paths
        ],
        "frame_paths": [str(path) for path in frame_paths],
    }


async def _run_freezone_analyze_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        AnalyzeCreativeCanvasShotsJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    frame_paths = [str(path) for path in payload.get("frame_paths") or []]
    _update(
        ctx, "freezone_analyze", job_id, 0.1, f"Vision 分析 {len(frame_paths)} 帧..."
    )
    result = await creative_canvas_job_execution_use_cases().analyze_shots(
        AnalyzeCreativeCanvasShotsJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            frame_paths=tuple(frame_paths),
            model=payload.get("model"),
            analysis_mode=str(payload.get("analysis_mode") or "shots"),
            duration_sec=payload.get("duration_sec"),
        )
    )
    output_path = Path(str(result["output_path"]))
    return {
        "job_id": job_id,
        "output_path": str(output_path),
        "output_url": make_static_url_for_context(
            ctx,
            output_path.relative_to(project_dir).as_posix(),
        ),
        "model": result.get("model"),
        "analysis_mode": result.get("analysis_mode"),
        "frame_count": result.get("frame_count"),
        "analyses": result.get("analyses"),
        "video_story": result.get("video_story"),
    }


async def _run_freezone_video_story_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        AnalyzeCreativeCanvasShotsJobCommand,
        ExtractCreativeCanvasFramesJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_video_story", job_id, 0.1, "ffmpeg 抽取关键帧...")
    job_execution = creative_canvas_job_execution_use_cases()
    frame_paths = await job_execution.extract_frames(
        ExtractCreativeCanvasFramesJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            video_path=Path(str(payload["video_path"])),
            max_frames=int(payload.get("max_frames") or 20),
            scene_threshold=float(payload.get("scene_threshold") or 0.3),
        )
    )
    frame_urls = [
        make_static_url_for_context(ctx, path.relative_to(project_dir).as_posix())
        for path in frame_paths
    ]
    _update(
        ctx,
        "freezone_video_story",
        job_id,
        0.55,
        f"Vision 解析 {len(frame_paths)} 帧为视频故事...",
    )
    result = await job_execution.analyze_shots(
        AnalyzeCreativeCanvasShotsJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            frame_paths=tuple(str(path) for path in frame_paths),
            model=payload.get("model"),
            analysis_mode="video_story",
            duration_sec=payload.get("duration_sec"),
        )
    )
    output_path = Path(str(result["output_path"]))
    return {
        "job_id": job_id,
        "output_url": make_static_url_for_context(
            ctx,
            output_path.relative_to(project_dir).as_posix(),
        ),
        "model": result.get("model"),
        "analysis_mode": "video_story",
        "frame_count": len(frame_paths),
        "frame_urls": frame_urls,
        "analyses": result.get("analyses"),
        "video_story": result.get("video_story"),
    }


def run_freezone_gen(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_gen_async(envelope, ctx))


def run_freezone_edit(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_edit_async(envelope, ctx))


def run_mainline_sketch_from_context(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope, _run_mainline_sketch_from_context_async(envelope, ctx)
    )


def run_mainline_frame_from_context(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope, _run_mainline_frame_from_context_async(envelope, ctx)
    )


async def _run_mainline_sketch_from_context_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.task_execution.infrastructure.runners.sketch import _run_sketch_generation_async

    payload = envelope.get("payload") or {}
    task_type = str(envelope.get("task_type") or "mainline_sketch_from_context")
    job_id = str(payload["job_id"])
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or payload.get("beat_num") or 0)
    scope = str(envelope.get("scope") or job_id)
    project_dir = Path(
        str(payload.get("output_dir") or payload.get("project_dir") or ctx.output_dir)
    )

    result = await _run_sketch_generation_async(envelope, ctx)
    out_path = Path(str(result.get("sketch_path") or ""))
    if not out_path.exists():
        raise FileNotFoundError(f"mainline sketch output missing: {out_path}")
    rel = out_path.relative_to(project_dir).as_posix()
    response = {
        **result,
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel, local_path=out_path),
        "media_type": "image",
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type=task_type,
        job_id=job_id,
        media_type="image",
        result=response,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )
    if history_record:
        response["generation_history_record"] = history_record
    return response


async def _run_mainline_frame_from_context_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.task_execution.infrastructure.runners.render import _run_selected_regen_async

    payload = envelope.get("payload") or {}
    task_type = str(envelope.get("task_type") or "mainline_frame_from_context")
    job_id = str(payload["job_id"])
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or payload.get("beat_num") or 0)
    scope = str(envelope.get("scope") or job_id)
    project_dir = Path(
        str(payload.get("output_dir") or payload.get("project_dir") or ctx.output_dir)
    )

    result = await _run_selected_regen_async(envelope, ctx, is_sketch=False)
    # Single-beat skill run (1x1): one grid → one rel path under project_dir.
    grid_paths = result.get("grid_paths") or {}
    rel = grid_paths.get(beat_num) or (
        next(iter(grid_paths.values())) if grid_paths else ""
    )
    if not rel:
        grid_results = result.get("grid_results") or []
        rel = str(grid_results[0].get("rel_path") or "") if grid_results else ""
    if not rel:
        raise FileNotFoundError("mainline frame output missing (no grid path)")
    out_path = (project_dir / rel).resolve()
    if not out_path.exists():
        raise FileNotFoundError(f"mainline frame output missing: {out_path}")
    rel = out_path.relative_to(project_dir).as_posix()
    response = {
        **result,
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel, local_path=out_path),
        "media_type": "image",
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type=task_type,
        job_id=job_id,
        media_type="image",
        result=response,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )
    if history_record:
        response["generation_history_record"] = history_record
    return response


async def _run_mainline_director_control_sketch_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.asset_world.public import (
        convert_control_frame_to_sketch,
    )
    from ai_anime.modules.creative_canvas.public import (
        creative_canvas_job_workspace,
    )

    payload = envelope.get("payload") or {}
    task_type = str(envelope.get("task_type") or "mainline_director_control_sketch")
    job_id = str(payload["job_id"])
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or payload.get("beat_num") or 0)
    scope = str(envelope.get("scope") or job_id)
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    state_dir = str(payload.get("state_dir") or ctx.state_dir)
    output_path = creative_canvas_job_workspace().image_output_path(
        project_dir,
        task_type,
        job_id,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    _update(
        ctx,
        task_type,
        scope,
        0.05,
        f"开始 Beat {beat_num} 导演合成图转草图候选...",
        episode=episode,
    )
    result = await _await_with_cancel_watch(
        convert_control_frame_to_sketch(
            user=ctx.owner_username,
            project=ctx.project_name,
            episode=episode,
            beat=beat_num,
            mode_key=str(payload.get("mode_key") or ""),
            aspect_ratio=str(payload.get("aspect_ratio") or ""),
            output_dir=project_dir,
            state_dir=state_dir,
            control_frame_path=payload.get("control_frame_path") or None,
            model=str(payload.get("model") or "").strip() or None,
            model_selector=str(payload.get("model_selector") or "").strip() or None,
            require_control_frame_path=True,
            candidate_output_path=output_path,
            promote=False,
        ),
        project_id=ctx.project_id,
        task_type=task_type,
        episode=episode,
        task_id=str(envelope.get("__run_task_id") or ""),
        beat_num=beat_num,
        scope=scope,
    )
    out_path = Path(str(result.get("output_path") or output_path))
    rel = out_path.relative_to(project_dir).as_posix()
    response = {
        **result,
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel, local_path=out_path),
        "media_type": "image",
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type=task_type,
        job_id=job_id,
        media_type="image",
        result=response,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
    )
    if history_record:
        response["generation_history_record"] = history_record
    _update(ctx, task_type, scope, 1.0, "导演合成图草图候选已生成", episode=episode)
    return response


def run_mainline_director_control_sketch(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope, _run_mainline_director_control_sketch_async(envelope, ctx)
    )


def run_freezone_mask_edit(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_mask_edit_async(envelope, ctx))


def run_freezone_extract(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_extract_async(envelope, ctx))


def run_freezone_analyze(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_analyze_async(envelope, ctx))


def run_freezone_video_story(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_video_story_async(envelope, ctx))


async def _run_freezone_video_erase_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        EraseCreativeCanvasVideoJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_video_erase", job_id, 0.1, "开始视频擦除处理...")
    output_path, meta = await creative_canvas_job_execution_use_cases().erase_video(
        EraseCreativeCanvasVideoJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            source_path=str(payload["source_path"]),
            mode=str(payload.get("mode") or "smart_subtitle"),
            box_x=payload.get("box_x"),
            box_y=payload.get("box_y"),
            box_width=payload.get("box_width"),
            box_height=payload.get("box_height"),
        )
    )
    rel = output_path.relative_to(project_dir).as_posix()
    return {
        "job_id": job_id,
        "output_format": "mp4",
        "output_path": str(output_path),
        "output_url": make_static_url_for_context(ctx, rel),
        "meta": meta,
    }


async def _run_freezone_video_upscale_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        UpscaleCreativeCanvasVideoJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_video_upscale", job_id, 0.1, "开始视频高清处理...")
    output_path, meta = await creative_canvas_job_execution_use_cases().upscale_video(
        UpscaleCreativeCanvasVideoJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            source_path=str(payload["source_path"]),
            resolution=str(payload.get("resolution") or "1080p"),
            frame_interpolation=str(
                payload.get("frame_interpolation") or "none"
            ),
            denoise_strength=str(payload.get("denoise_strength") or "1x"),
        )
    )
    rel = output_path.relative_to(project_dir).as_posix()
    return {
        "job_id": job_id,
        "output_format": "mp4",
        "output_path": str(output_path),
        "output_url": make_static_url_for_context(ctx, rel),
        "meta": meta,
    }


async def _run_freezone_audio_separate_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        SeparateCreativeCanvasAudioJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_audio_separate", job_id, 0.1, "开始音视频分离...")
    outputs = await creative_canvas_job_execution_use_cases().separate_audio(
        SeparateCreativeCanvasAudioJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            source_path=str(payload["source_path"]),
        )
    )
    audio_path = outputs.get("audio_path")
    mute_video_path = outputs.get("mute_video_path")
    audio_rel = audio_path.relative_to(project_dir).as_posix() if audio_path else ""
    mute_rel = (
        mute_video_path.relative_to(project_dir).as_posix() if mute_video_path else ""
    )
    response = {
        "job_id": job_id,
        "audio_url": make_static_url_for_context(ctx, audio_rel) if audio_rel else None,
        "mute_video_url": make_static_url_for_context(ctx, mute_rel)
        if mute_rel
        else None,
    }
    target_episode = payload.get("target_episode")
    target_beat = payload.get("target_beat")
    if audio_path and target_episode and target_beat:
        response["pushable"] = True
        response["slot_target"] = {
            "kind": "beat_audio",
            "episode": int(target_episode),
            "beat": int(target_beat),
        }
    return response


async def _run_freezone_video_compose_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        ComposeCreativeCanvasVideoJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    _update(ctx, "freezone_video_compose", job_id, 0.1, "开始合成视频时间线...")
    output_path = await creative_canvas_job_execution_use_cases().compose_video(
        ComposeCreativeCanvasVideoJobCommand(
            project_dir=project_dir,
            job_id=job_id,
            title=str(payload.get("title") or ""),
            canvas_id=str(payload.get("canvas_id") or ""),
            resolution=str(payload.get("resolution") or "1080p"),
            fps=int(payload.get("fps") or 30),
            background_color=str(payload.get("background_color") or "#000000"),
            keep_original_audio=bool(payload.get("keep_original_audio", True)),
            tracks=tuple(payload.get("tracks") or ()),
        )
    )
    rel = output_path.relative_to(project_dir).as_posix()
    return {
        "job_id": job_id,
        "output_format": "mp4",
        "output_path": str(output_path),
        "output_url": make_static_url_for_context(ctx, rel),
    }


def run_freezone_video_erase(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_video_erase_async(envelope, ctx))


def run_freezone_video_upscale(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_video_upscale_async(envelope, ctx))


def run_freezone_audio_separate(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_audio_separate_async(envelope, ctx))


def run_freezone_video_compose(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_video_compose_async(envelope, ctx))


async def _run_freezone_text_translate_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        creative_canvas_job_workspace,
        translate_creative_canvas_text,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    creative_canvas_job_workspace().initialize(project_dir)
    node_type = str(payload.get("node_type") or "generic")
    _update(ctx, "freezone_text_translate", job_id, 0.1, "开始翻译文本...")
    (
        translated_text,
        source_language,
        target_language,
    ) = await translate_creative_canvas_text(
        text=str(payload.get("text") or ""),
        model=str(payload.get("model") or ""),
        model_selector=str(payload.get("model_id") or "") or None,
        node_type=node_type,
    )
    data = {
        "translated_text": translated_text,
        "source_language": source_language,
        "target_language": target_language,
        "node_type": node_type,
    }
    out = (
        creative_canvas_job_workspace().output_directory(
            project_dir,
            "freezone_text_translate",
        )
        / f"{job_id}.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    import json

    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    rel = out.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_format": "json",
        "output_path": str(out),
        "output_url": make_static_url_for_context(ctx, rel),
        **data,
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type="freezone_text_translate",
        job_id=job_id,
        media_type="text",
        node_type=node_type,
        input_preview=str(payload.get("text") or "")[:240],
        result=result,
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


async def _run_freezone_story_script_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        ExtractCreativeCanvasFramesJobCommand,
        bind_creative_canvas_story_script_assets,
        creative_canvas_job_execution_use_cases,
        creative_canvas_job_workspace,
        generate_creative_canvas_story_script,
        generate_creative_canvas_story_script_with_vision,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    creative_canvas_job_workspace().initialize(project_dir)
    source_text = str(payload.get("source_text") or "")
    prompt = str(payload.get("prompt") or "")
    model = str(payload.get("model") or "")
    model_selector = str(payload.get("model_id") or "") or None
    character_refs = list(payload.get("character_refs") or [])
    character_image_paths = [
        str(path) for path in payload.get("character_image_paths") or []
    ]
    video_path = str(payload.get("video_path") or "")
    duration_sec = payload.get("duration_sec")

    frame_paths: list[Path] = []
    frame_urls: list[str] = []
    if video_path:
        _update(ctx, "freezone_story_script", job_id, 0.1, "ffmpeg 抽取关键帧...")
        frame_paths = await creative_canvas_job_execution_use_cases().extract_frames(
            ExtractCreativeCanvasFramesJobCommand(
                project_dir=project_dir,
                job_id=job_id,
                video_path=Path(video_path),
                max_frames=int(payload.get("max_frames") or 20),
                scene_threshold=float(payload.get("scene_threshold") or 0.3),
            )
        )
        frame_urls = [
            make_static_url_for_context(ctx, path.relative_to(project_dir).as_posix())
            for path in frame_paths
        ]

    if frame_paths or character_image_paths:
        _update(
            ctx,
            "freezone_story_script",
            job_id,
            0.55,
            (
                f"视觉模型解析 {len(frame_paths)} 帧为分镜脚本..."
                if frame_paths
                else "视觉模型读取角色参考图生成故事脚本..."
            ),
        )
        payload_data = await generate_creative_canvas_story_script_with_vision(
            frame_paths=frame_paths,
            character_image_paths=character_image_paths,
            source_text=source_text,
            prompt=prompt,
            duration_sec=float(duration_sec) if duration_sec else None,
            character_refs=character_refs,
            model=model,
            model_selector=model_selector,
        )
    else:
        _update(ctx, "freezone_story_script", job_id, 0.1, "开始生成故事脚本...")
        payload_data = await generate_creative_canvas_story_script(
            source_text=source_text,
            prompt=prompt,
            model=model,
            model_selector=model_selector,
            character_refs=character_refs,
        )
    payload_data = bind_creative_canvas_story_script_assets(
        payload_data,
        frame_urls=frame_urls,
        character_refs=character_refs,
    )
    out = (
        creative_canvas_job_workspace().output_directory(
            project_dir,
            "freezone_story_script",
        )
        / f"{job_id}.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    import json

    out.write_text(
        json.dumps(payload_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    rel = out.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_format": "json",
        "output_path": str(out),
        "output_url": make_static_url_for_context(ctx, rel),
        **payload_data,
    }
    if frame_urls:
        result["frame_urls"] = frame_urls
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type="freezone_story_script",
        job_id=job_id,
        media_type="text",
        model=str(payload.get("model") or ""),
        source_text_preview=str(payload.get("source_text") or "")[:240],
        row_count=len(payload_data.get("rows") or []),
        result=result,
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


async def _run_freezone_image_reverse_prompt_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        creative_canvas_job_workspace,
        creative_canvas_reverse_prompt_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    creative_canvas_job_workspace().initialize(project_dir)
    source_path = Path(str(payload["source_path"]))
    _update(ctx, "freezone_image_reverse_prompt", job_id, 0.1, "开始反推图片提示词...")
    prompt = await creative_canvas_reverse_prompt_execution_use_cases().generate(
        source_path
    )
    out = (
        creative_canvas_job_workspace().output_directory(
            project_dir,
            "freezone_image_reverse_prompt",
        )
        / f"{job_id}.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    import json

    out.write_text(
        json.dumps({"prompt": prompt}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    rel = out.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_format": "json",
        "output_path": str(out),
        "output_url": make_static_url_for_context(ctx, rel),
        "prompt": prompt,
    }
    history_record = _append_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        task_type="freezone_image_reverse_prompt",
        job_id=job_id,
        media_type="text",
        source_path=str(source_path),
        result=result,
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


def run_freezone_text_translate(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_text_translate_async(envelope, ctx))


def run_freezone_story_script(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_story_script_async(envelope, ctx))


def run_freezone_image_reverse_prompt(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    return _run_cancellable(
        envelope, _run_freezone_image_reverse_prompt_async(envelope, ctx)
    )


async def _run_freezone_audio_speech_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.infrastructure.project_stores import (
        make_sqlite_store_for_context,
    )
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        creative_canvas_job_workspace,
        generate_creative_canvas_audio_speech,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    creative_canvas_job_workspace().initialize(project_dir)
    _update(ctx, "freezone_audio_speech", job_id, 0.1, "开始文本生成语音...")
    store = await make_sqlite_store_for_context(ctx)
    try:
        result = await generate_creative_canvas_audio_speech(
            store=store,
            username=ctx.owner_username,
            project=ctx.project_name,
            account_voice_username=str(
                payload.get("account_voice_username")
                or ctx.requester_username
                or ctx.owner_username
            ),
            project_dir=project_dir,
            job_id=job_id,
            text=str(payload.get("text") or ""),
            emotion_prompt=str(payload.get("emotion_prompt") or ""),
            mode=str(payload.get("mode") or "VOICE_CLONE"),
            voice=str(payload.get("voice") or ""),
            model_selector=str(payload.get("model_selector") or "") or None,
            voice_ref=payload.get("voice_ref"),
        )
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()
    rel = result.audio_path.relative_to(project_dir).as_posix()
    audio_url = make_static_url_for_context(ctx, rel)
    response = {
        "job_id": job_id,
        "url": audio_url,
        "audio_url": audio_url,
        "audio_size": result.audio_path.stat().st_size,
        "duration_ms": result.duration_ms,
        "mime_type": result.mime_type,
        "model": result.model,
        "voice_source": result.voice_source,
        "voice_sha256": result.voice_sha256,
    }
    target_episode = payload.get("target_episode")
    target_beat = payload.get("target_beat")
    if target_episode and target_beat:
        response["pushable"] = True
        response["slot_target"] = {
            "kind": "beat_audio",
            "episode": int(target_episode),
            "beat": int(target_beat),
        }
    return response


def run_freezone_audio_speech(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(envelope, _run_freezone_audio_speech_async(envelope, ctx))


async def _bind_generated_voice(
    *,
    ctx: ProjectContext,
    voice_id: str,
    binding: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not binding:
        return None
    from ai_anime.modules.asset_world.public import (
        character_voice_use_cases,
        probe_voice_sample_duration_seconds,
    )
    from ai_anime.modules.creative_canvas.public import (
        GetCreativeCanvasAudioVoiceQuery,
        creative_canvas_audio_library_use_cases,
    )
    from ai_anime.modules.project_workspace.public import (
        persist_narrator_voice_source,
    )
    from ai_anime.shared.infrastructure.project_stores import (
        make_sqlite_store_for_context,
    )
    from ai_anime.shared.utils.async_ops import call_blocking
    from ai_anime.shared.utils.voice_samples import (
        validate_reference_voice_duration_seconds,
    )

    source_path = creative_canvas_audio_library_use_cases().get_voice(
        GetCreativeCanvasAudioVoiceQuery(context=ctx, voice_id=voice_id)
    )
    duration = await call_blocking(probe_voice_sample_duration_seconds, source_path)
    validate_reference_voice_duration_seconds(duration)

    kind = str(binding.get("kind") or "").strip()
    if kind == "project_narrator":
        return await call_blocking(persist_narrator_voice_source, ctx, source_path)

    character_name = str(binding.get("character_name") or "").strip()
    store = await make_sqlite_store_for_context(ctx)
    try:
        if kind == "identity":
            return await character_voice_use_cases().bind_identity_sample(
                repository=store,
                project_dir=ctx.output_dir,
                character_name=character_name,
                identity_id=str(binding.get("identity_id") or "").strip(),
                source_path=source_path,
                media_url=lambda _path: "",
            )
        if kind == "character_slot":
            return await character_voice_use_cases().bind_sample(
                repository=store,
                project_dir=ctx.output_dir,
                character_name=character_name,
                slot=str(binding.get("slot") or "").strip(),
                source_path=source_path,
                media_url=lambda _path: "",
            )
        raise ValueError("不支持的角色声线绑定目标")
    finally:
        await store.close()


async def _run_freezone_voice_design_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.creative_canvas.public import (
        CreateCreativeCanvasAudioVoiceCommand,
        creative_canvas_audio_library_use_cases,
    )
    from ai_anime.modules.model_usage.public import write_model_audio_voice_design

    payload = envelope.get("payload") or {}
    job_id = str(payload.get("job_id") or envelope.get("scope") or "")
    scope = str(envelope.get("scope") or job_id)
    response_format = str(payload.get("response_format") or "wav")
    _update(ctx, "freezone_voice_design", scope, 0.10, "开始设计声线...")
    with TemporaryDirectory(prefix="ai-anime-voice-design-") as temp_dir:
        output_path = Path(temp_dir) / f"voice.{response_format}"
        result = await write_model_audio_voice_design(
            output_path=output_path,
            voice_prompt=str(payload.get("voice_prompt") or ""),
            preview_text=str(payload.get("preview_text") or ""),
            model_selector=str(payload.get("model_selector") or ""),
            preferred_name=str(payload.get("preferred_name") or "custom_voice"),
            language=str(payload.get("language") or "zh"),
            sample_rate=int(payload.get("sample_rate") or 24000),
            response_format=response_format,
        )
        _update(ctx, "freezone_voice_design", scope, 0.75, "保存账号声线...")
        voice = dict(
            creative_canvas_audio_library_use_cases().create_voice(
                CreateCreativeCanvasAudioVoiceCommand(
                    context=ctx,
                    name=str(payload.get("name") or payload.get("voice_prompt") or "")[:80],
                    filename=output_path.name,
                    content=output_path.read_bytes(),
                    mime_type=(
                        "audio/wav" if response_format == "wav" else "audio/mpeg"
                    ),
                )
            )
        )
    voice_id = str(voice.get("voice_id") or "")
    bound = await _bind_generated_voice(
        ctx=ctx,
        voice_id=voice_id,
        binding=payload.get("binding") if isinstance(payload.get("binding"), dict) else None,
    )
    _update(ctx, "freezone_voice_design", scope, 0.95, "声线已生成并绑定")
    return {
        **voice,
        "provider_voice_id": result.voice_id,
        "binding": bound,
    }


def run_freezone_voice_design(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope,
        _run_freezone_voice_design_async(envelope, ctx),
        task_type="freezone_voice_design",
    )


async def _run_freezone_voice_preset_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.creative_canvas.public import (
        CreateCreativeCanvasPresetVoiceCommand,
        creative_canvas_audio_library_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload.get("job_id") or envelope.get("scope") or "")
    scope = str(envelope.get("scope") or job_id)
    _update(ctx, "freezone_voice_preset", scope, 0.10, "开始生成预设声线...")
    voice = dict(
        await creative_canvas_audio_library_use_cases().create_preset_voice(
            CreateCreativeCanvasPresetVoiceCommand(
                context=ctx,
                project_dir=Path(str(payload.get("project_dir") or ctx.output_dir)),
                name=str(payload.get("name") or ""),
                model_selector=str(payload.get("model_selector") or ""),
                voice=str(payload.get("voice") or ""),
                text=str(payload.get("text") or ""),
            )
        )
    )
    _update(ctx, "freezone_voice_preset", scope, 0.80, "保存并绑定预设声线...")
    bound = await _bind_generated_voice(
        ctx=ctx,
        voice_id=str(voice.get("voice_id") or ""),
        binding=payload.get("binding") if isinstance(payload.get("binding"), dict) else None,
    )
    _update(ctx, "freezone_voice_preset", scope, 0.95, "预设声线已生成并绑定")
    return {**voice, "binding": bound}


def run_freezone_voice_preset(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope,
        _run_freezone_voice_preset_async(envelope, ctx),
        task_type="freezone_voice_preset",
    )


async def _run_freezone_mark_detect_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.creative_canvas.public import (
        CreativeCanvasMarkSelection,
        DetectCreativeCanvasMarkCommand,
        creative_canvas_mark_detection_use_cases,
    )

    payload = envelope.get("payload") or {}
    scope = str(envelope.get("scope") or payload.get("job_id") or "")
    selection_data = payload.get("selection") or {}
    _update(ctx, "freezone_mark_detect", scope, 0.10, "读取图片与选区...")
    result = await creative_canvas_mark_detection_use_cases().detect(
        DetectCreativeCanvasMarkCommand(
            project_dir=Path(str(payload.get("project_dir") or ctx.output_dir)),
            source_url=str(payload.get("source_url") or ""),
            selection=CreativeCanvasMarkSelection(
                point_x=selection_data.get("point_x"),
                point_y=selection_data.get("point_y"),
                box_x=selection_data.get("box_x"),
                box_y=selection_data.get("box_y"),
                box_width=selection_data.get("box_width"),
                box_height=selection_data.get("box_height"),
            ),
        )
    )
    _update(ctx, "freezone_mark_detect", scope, 0.95, "局部标记识别完成")
    selection = result.selection
    return {
        "mark": {
            "label": result.label,
            "source_url": result.source_url,
            "point_x": selection.point_x,
            "point_y": selection.point_y,
            "box_x": selection.box_x,
            "box_y": selection.box_y,
            "box_width": selection.box_width,
            "box_height": selection.box_height,
            "note": result.note,
        },
        "model": result.model,
    }


def run_freezone_mark_detect(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope,
        _run_freezone_mark_detect_async(envelope, ctx),
        task_type="freezone_mark_detect",
    )


async def _run_freezone_ai_staging_prop_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.creative_canvas.public import (
        GenerateCreativeCanvasStagingPropCommand,
        creative_canvas_staging_prop_use_cases,
    )

    payload = envelope.get("payload") or {}
    scope = str(envelope.get("scope") or payload.get("job_id") or "")
    request = payload.get("request")
    if not isinstance(request, dict):
        raise ValueError("AI 布景道具任务缺少请求参数")
    _update(ctx, "freezone_ai_staging_prop", scope, 0.10, "分析布景道具需求...")
    result = await creative_canvas_staging_prop_use_cases().generate(
        GenerateCreativeCanvasStagingPropCommand(request=request)
    )
    _update(ctx, "freezone_ai_staging_prop", scope, 0.95, "AI 布景道具生成完成")
    return dict(result)


def run_freezone_ai_staging_prop(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return _run_cancellable(
        envelope,
        _run_freezone_ai_staging_prop_async(envelope, ctx),
        task_type="freezone_ai_staging_prop",
    )


async def _run_freezone_audio_eleven_music_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        creative_canvas_job_workspace,
        generate_creative_canvas_audio_music,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    creative_canvas_job_workspace().initialize(project_dir)
    _update(ctx, "freezone_audio_eleven_music", job_id, 0.1, "开始文本生成音乐...")
    result = await generate_creative_canvas_audio_music(
        project_dir=project_dir,
        job_id=job_id,
        prompt=str(payload.get("input") or ""),
        response_format=str(payload.get("response_format") or "mp3"),
        music_length_ms=int(payload.get("music_length_ms") or 30_000),
        force_instrumental=bool(payload.get("force_instrumental", True)),
        respect_sections_durations=bool(
            payload.get("respect_sections_durations", True)
        ),
        output_format=str(payload.get("output_format") or "mp3_44100_128"),
    )
    rel = result.audio_path.relative_to(project_dir).as_posix()
    audio_url = make_static_url_for_context(ctx, rel)
    return {
        "job_id": job_id,
        "url": audio_url,
        "audio_url": audio_url,
        "audio_size": result.audio_path.stat().st_size,
        "duration_ms": result.duration_ms,
        "mime_type": result.mime_type,
        "model": result.model,
    }


def run_freezone_audio_eleven_music(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    return _run_cancellable(
        envelope, _run_freezone_audio_eleven_music_async(envelope, ctx)
    )


register_project_task_runner("freezone_gen", run_freezone_gen)
register_project_task_runner("freezone_edit", run_freezone_edit)
register_project_task_runner(
    "mainline_sketch_from_context", run_mainline_sketch_from_context
)
register_project_task_runner(
    "mainline_frame_from_context", run_mainline_frame_from_context
)
register_project_task_runner(
    "mainline_director_control_sketch",
    run_mainline_director_control_sketch,
)
register_project_task_runner("freezone_mask_edit", run_freezone_mask_edit)
register_project_task_runner("freezone_extract", run_freezone_extract)
register_project_task_runner("freezone_analyze", run_freezone_analyze)
register_project_task_runner("freezone_video_story", run_freezone_video_story)
register_project_task_runner("freezone_video_erase", run_freezone_video_erase)
register_project_task_runner("freezone_video_upscale", run_freezone_video_upscale)
register_project_task_runner("freezone_audio_separate", run_freezone_audio_separate)
register_project_task_runner("freezone_video_compose", run_freezone_video_compose)
register_project_task_runner("freezone_text_translate", run_freezone_text_translate)
register_project_task_runner("freezone_story_script", run_freezone_story_script)
register_project_task_runner(
    "freezone_image_reverse_prompt",
    run_freezone_image_reverse_prompt,
)
register_project_task_runner("freezone_audio_speech", run_freezone_audio_speech)
register_project_task_runner("freezone_voice_design", run_freezone_voice_design)
register_project_task_runner("freezone_voice_preset", run_freezone_voice_preset)
register_project_task_runner("freezone_mark_detect", run_freezone_mark_detect)
register_project_task_runner(
    "freezone_ai_staging_prop", run_freezone_ai_staging_prop
)
register_project_task_runner(
    "freezone_audio_eleven_music", run_freezone_audio_eleven_music
)

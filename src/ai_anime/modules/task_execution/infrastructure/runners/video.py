"""Celery runners for video-generation tasks."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from ai_anime.modules.production.public import (
    AddGeneratedVideoCommand,
    GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
    SINGLE_VIDEO_TASK_TYPE,
    video_model_uses_advanced_reference_workflow,
    video_pool_use_cases,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.narrative_planning.public import resolve_target_video_duration
from ai_anime.modules.task_execution.public import (
    TaskTimedOut,
    await_envelope_with_cancel_watch,
    raise_if_envelope_cancel_requested,
    remaining_timeout_seconds,
)
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.modules.task_execution.public import run_project_subprocess
from ai_anime.modules.task_execution.public import project_task_state_key
from ai_anime.shared.infrastructure.video_encoding import (
    ffmpeg_video_encoding_args,
)
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager


def _log(manager, ctx: ProjectContext, envelope: dict[str, Any], message: str) -> None:
    manager.update_progress_for_project(
        ctx,
        str(envelope["task_type"]),
        int(envelope.get("episode") or 0),
        beat_num=envelope.get("beat_num"),
        scope=envelope.get("scope"),
        current_task=message,
        logs=[message],
    )


def _resolve_video_aspect_ratio(value: object, frame_path: object) -> str:
    requested = str(value or "").strip().lower()
    if requested and requested != "auto":
        return requested
    path = Path(str(frame_path or "").strip())
    if path.is_file():
        try:
            from PIL import Image

            with Image.open(path) as image:
                width, height = image.size
            if width > 0 and height > 0:
                return "16:9" if width >= height else "9:16"
        except (OSError, ValueError):
            pass
    return "9:16"


def _append_freezone_video_node_history(
    *,
    ctx: ProjectContext,
    project_dir: Path,
    payload: dict[str, Any],
    job_id: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any] | None:
    node_id = str(payload.get("node_id") or "").strip()
    if not node_id:
        return None

    from ai_anime.modules.creative_canvas.public import (
        RecordCreativeCanvasGenerationCommand,
        creative_canvas_generation_history_use_cases,
    )

    extra: dict[str, Any] = {}
    if payload.get("model_id"):
        extra["model"] = str(payload["model_id"])
    history_mode = payload.get("requested_gen_mode") or payload.get("gen_mode")
    if history_mode:
        extra["gen_mode"] = str(history_mode)

    return creative_canvas_generation_history_use_cases().record(
        RecordCreativeCanvasGenerationCommand(
            project_dir=project_dir,
            canvas_id=str(payload.get("canvas_id") or "default"),
            node_id=node_id,
            task_type="freezone_video_gen",
            job_id=job_id,
            task_key=project_task_state_key(
                "freezone_video_gen",
                ctx.project_id,
                0,
                scope=job_id,
            ),
            status="failed" if error else "completed",
            media_type="video",
            result=result,
            error=error,
            prompt=payload.get("prompt"),
            extra=extra or None,
        )
    )


async def _run_single_video_async(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    task_type = SINGLE_VIDEO_TASK_TYPE
    episode = int(envelope.get("episode") or 0)
    beat_num = int(envelope.get("beat_num") or 0)
    payload = envelope.get("payload") or {}
    config = dict(payload.get("config") or {})
    output_dir = str(payload.get("output_dir") or ctx.output_dir)

    manager = get_task_manager()
    _log(manager, ctx, envelope, f"开始生成 Beat {beat_num} 视频")

    from ai_anime.modules.production.public import (
        ShotReference,
        create_video_generator,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    beat = config.get("beat", {})
    frame_path = config.get("frame_path")
    video_mode = config.get("video_mode", "first_frame")
    prompt = config.get("prompt", "")
    video_duration = config.get("video_duration", 5.0)
    video_model = str(config.get("video_model") or "").strip()
    last_frame_path = config.get("last_frame_path")
    video_config = config.get("video_config") or beat.get("video_config_json")
    uses_advanced_reference = video_model_uses_advanced_reference_workflow(
        video_model
    )

    paths = PathResolver(output_dir, episode)
    videos_dir = paths.videos_dir()
    videos_dir.mkdir(parents=True, exist_ok=True)
    video_path = paths.video(beat_num)
    gen_kwargs: dict[str, Any] = {}
    # 标准工作流的清晰度走构造参数；高级参考工作流在准备阶段并入视频配置。
    single_resolution = config.get("resolution")
    if single_resolution and not uses_advanced_reference:
        gen_kwargs["resolution"] = str(single_resolution)
    video_gen = create_video_generator(
        model_role=str(config.get("model_role") or ""),
        model=video_model or None,
        model_selector=str(config.get("model_selector") or "") or None,
        **gen_kwargs,
    )

    def on_log(msg: str) -> None:
        _log(manager, ctx, envelope, msg)

    def on_progress(value: float) -> None:
        manager.update_progress_for_project(
            ctx,
            task_type,
            episode,
            beat_num=beat_num,
            progress=value,
            current_task=f"生成 Beat {beat_num} 视频",
        )

    if video_mode == "keyframe" and last_frame_path and not uses_advanced_reference:
        video_duration = 5.0

    video_references = []
    if uses_advanced_reference:
        from ai_anime.modules.production.public import (
            VideoReferenceMode,
            prepare_video_reference_generation_inputs,
        )

        prepared = await prepare_video_reference_generation_inputs(
            project_output=output_dir,
            episode=episode,
            beat={**beat, "video_config_json": video_config or "{}"},
            next_beat=config.get("next_beat"),
            video_mode=video_mode,
            prompt=prompt,
            duration=video_duration,
            resolution=(
                str(config["resolution"])
                if config.get("resolution") is not None
                else None
            ),
            ratio=str(config["ratio"]) if config.get("ratio") is not None else None,
            prop_menu=config.get("prop_menu"),
        )
        prompt = prepared.prompt
        video_duration = prepared.duration
        frame_path = prepared.image_path
        last_frame_path = prepared.last_frame_path
        video_config = prepared.video_config_json
        video_references = prepared.references
        video_mode = (
            "keyframe"
            if prepared.mode == VideoReferenceMode.FIRST_LAST_FRAME
            else "first_frame"
        )

    model_references = video_references
    if not uses_advanced_reference:
        model_references = [
            ShotReference(
                type=str(item.get("type") or "image"),
                path=str(item.get("path") or ""),
                role=str(item.get("role") or ""),
                field=str(item.get("field") or ""),
            )
            for item in config.get("references") or []
            if isinstance(item, dict) and str(item.get("path") or "").strip()
        ]

    generate_kwargs = {
        "image_path": frame_path,
        "prompt": prompt,
        "output_path": video_path.as_posix(),
        "aspect_ratio": _resolve_video_aspect_ratio(
            config.get("ratio"),
            frame_path,
        ),
        "duration": video_duration,
        "on_log": on_log,
        "on_progress": on_progress,
        "last_frame_path": last_frame_path,
        "project_output_dir": output_dir,
        "episode": episode,
        "beat_num": beat_num,
        "task_type": task_type,
    }
    if model_references:
        generate_kwargs["references"] = model_references
    if config.get("audio_setting"):
        generate_kwargs["audio_setting"] = str(config["audio_setting"])
    if uses_advanced_reference:
        generate_kwargs["video_config"] = video_config

    result = await video_gen.generate(**generate_kwargs)
    if result.status.value != "done":
        raise RuntimeError(result.error or "视频生成失败")

    if _normalize_embedded_audio(
        video_path,
        timeout_seconds=remaining_timeout_seconds(
            envelope,
            default_seconds=10 * 60,
        ),
    ):
        on_log("已校正视频内置音轨响度")

    video_pool_id = None
    try:
        entry = video_pool_use_cases().add_generated(
            ctx,
            AddGeneratedVideoCommand(
                episode_num=episode,
                beat_num=beat_num,
                source_video_path=Path(video_path),
                output_dir=output_dir,
                duration=video_duration,
                video_mode=video_mode,
                video_model=video_model,
                prompt=prompt,
            ),
        )
        video_pool_id = entry.id
    except Exception as exc:  # noqa: BLE001
        on_log(f"添加到视频池失败 (非致命): {exc}")

    task_result = {
        "video_path": video_path.as_posix(),
        "beat_num": beat_num,
        "video_pool_id": video_pool_id,
    }
    if result.task_id:
        task_result["invocation_id"] = result.task_id
    if result.last_frame_path:
        task_result["last_frame_path"] = result.last_frame_path
    if result.last_frame_url:
        task_result["last_frame_url"] = result.last_frame_url
    return task_result


def run_single_video(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_single_video_async(envelope, ctx),
            envelope,
            task_type=SINGLE_VIDEO_TASK_TYPE,
        )
    )


register_project_task_runner(SINGLE_VIDEO_TASK_TYPE, run_single_video)


def _audio_duration(
    audio_path: Path, *, timeout_seconds: int | None = 30
) -> float | None:
    if not audio_path.exists():
        return None
    import subprocess

    try:
        result = run_project_subprocess(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise TaskTimedOut(timeout_seconds=timeout_seconds) from exc
    try:
        return float(result.stdout.strip())
    except Exception:
        return None


def _video_has_audio_stream(
    video_path: Path, *, timeout_seconds: int | None = 30
) -> bool:
    if not video_path.exists():
        return False
    import subprocess

    try:
        result = run_project_subprocess(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=index",
                "-of",
                "csv=p=0",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise TaskTimedOut(timeout_seconds=timeout_seconds) from exc
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0 and bool(result.stdout.strip())


def _normalize_embedded_audio(
    video_path: Path,
    *,
    timeout_seconds: int | None = 10 * 60,
) -> bool:
    """Normalize provider audio while copying the video stream unchanged."""

    if not _video_has_audio_stream(
        video_path,
        timeout_seconds=min(timeout_seconds or 30, 30),
    ):
        return False
    ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
    normalized_path = video_path.with_name(
        f".{video_path.stem}.audio-normalized{video_path.suffix}"
    )
    result = run_project_subprocess(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-c:v",
            "copy",
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(normalized_path),
        ],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    if result.returncode != 0 or not normalized_path.is_file():
        normalized_path.unlink(missing_ok=True)
        return False
    normalized_path.replace(video_path)
    return True


async def _run_video_generation_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.shared.utils.path_resolver import PathResolver

    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    output_dir = str(payload.get("output_dir") or ctx.output_dir)
    beats = list(payload.get("beats") or [])
    video_model = str(payload.get("video_model") or "").strip()
    resolution = str(payload.get("resolution") or "720p")
    ratio = str(payload.get("ratio") or "9:16")
    prop_menu = payload.get("prop_menu")
    use_director_render = bool(payload.get("use_director_render"))
    manager = get_task_manager()
    paths = PathResolver(output_dir, episode)
    generated: list[dict[str, Any]] = []

    for index, beat in enumerate(beats):
        beat_num = int(beat.get("beat_number") or index + 1)
        next_beat = beats[index + 1] if index + 1 < len(beats) else None
        manager.update_progress_for_project(
            ctx,
            "video_generation",
            episode,
            progress=index / max(1, len(beats)),
            current_task=f"生成 Beat {beat_num} 视频...",
        )
        frame_path = paths.first_frame_for_video(
            beat_num,
            use_director_render=use_director_render,
        )
        if not frame_path.exists():
            manager.update_progress_for_project(
                ctx,
                "video_generation",
                episode,
                logs=[f"Beat {beat_num} 缺少首帧，跳过: {frame_path}"],
            )
            continue

        video_mode = str(beat.get("video_mode") or "first_frame")
        prompt = str(
            beat.get("keyframe_prompt")
            if video_mode == "keyframe"
            else beat.get("video_prompt") or ""
        )
        audio_path = paths.audio(beat_num)
        duration = resolve_target_video_duration(
            beat,
            _audio_duration(
                audio_path,
                timeout_seconds=remaining_timeout_seconds(envelope, default_seconds=30),
            ),
        )
        last_frame_path = None
        if video_mode == "keyframe":
            next_beat_number = int((next_beat or {}).get("beat_number") or 0)
            if next_beat_number > 0:
                next_frame = paths.first_frame_for_video(
                    next_beat_number,
                    use_director_render=use_director_render,
                )
                if next_frame.exists():
                    last_frame_path = str(next_frame)
            if not last_frame_path:
                video_mode = "first_frame"
                prompt = str(beat.get("video_prompt") or "")

        model_role = (
            "VIDEO_FIRST_LAST_FRAME"
            if video_mode == "keyframe" and last_frame_path
            else "VIDEO_IMAGE_TO_VIDEO"
        )
        if (
            video_model_uses_advanced_reference_workflow(video_model)
            and model_role != "VIDEO_FIRST_LAST_FRAME"
        ):
            from ai_anime.modules.production.public import (
                VideoReferenceMode,
                parse_video_config,
            )

            reference_mode = parse_video_config(
                beat.get("video_config_json")
            ).mode
            model_role = {
                VideoReferenceMode.TEXT_TO_VIDEO: "VIDEO_TEXT_TO_VIDEO",
                VideoReferenceMode.FIRST_FRAME: "VIDEO_IMAGE_TO_VIDEO",
                VideoReferenceMode.FIRST_LAST_FRAME: "VIDEO_FIRST_LAST_FRAME",
                VideoReferenceMode.MULTIMODAL_REFERENCE: "VIDEO_ALL_REFERENCE",
            }[reference_mode]

        single_envelope = {
            "task_type": SINGLE_VIDEO_TASK_TYPE,
            "episode": episode,
            "beat_num": beat_num,
            "payload": {
                "output_dir": output_dir,
                "config": {
                    "beat": beat,
                    "next_beat": next_beat,
                    "frame_path": str(frame_path),
                    "video_mode": video_mode,
                    "prompt": prompt,
                    "video_duration": duration,
                    "video_model": video_model,
                    "model_role": model_role,
                    "last_frame_path": last_frame_path,
                    "resolution": resolution,
                    "ratio": ratio,
                    "prop_menu": prop_menu,
                },
            },
        }
        generated.append(await _run_single_video_async(single_envelope, ctx))

    return {"generated": len(generated), "items": generated}


def run_video_generation(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_video_generation_async(envelope, ctx),
            envelope,
            task_type="video_generation",
        )
    )


def run_compose_episode(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    import subprocess
    import tempfile

    from ai_anime.shared.utils.path_resolver import PathResolver

    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    output_dir = str(payload.get("output_dir") or ctx.output_dir)
    beats = list(payload.get("beats") or [])
    resolution = str(payload.get("resolution") or "720x1280")
    add_subtitles = bool(payload.get("add_subtitles"))
    manager = get_task_manager()
    paths = PathResolver(output_dir, episode)
    final_dir = Path(output_dir) / "videos" / "episodes"
    final_dir.mkdir(parents=True, exist_ok=True)
    output_path = final_dir / f"ep{episode:03d}_final.mp4"

    def check_cancel() -> None:
        raise_if_envelope_cancel_requested(
            envelope,
            task_type="compose_episode",
            episode=episode,
        )

    def subprocess_timeout(default_seconds: int) -> int | None:
        return remaining_timeout_seconds(envelope, default_seconds=default_seconds)

    def run_checked(cmd: list[str], *, default_timeout_seconds: int):
        try:
            return run_project_subprocess(
                cmd,
                envelope=envelope,
                capture_output=True,
                text=True,
                timeout=subprocess_timeout(default_timeout_seconds),
            )
        except subprocess.TimeoutExpired as exc:
            raise TaskTimedOut(
                timeout_seconds=int(envelope.get("__timeout_seconds") or 30 * 60)
            ) from exc

    try:
        target_width, target_height = map(int, resolution.split("x"))
    except Exception:
        target_width, target_height = 720, 1280

    video_clips: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for index, beat in enumerate(beats):
            check_cancel()
            beat_num = int(beat.get("beat_number") or index + 1)
            video_path = paths.video(beat_num)
            audio_path = paths.audio(beat_num)
            if not video_path.exists():
                continue
            clip_path = tmp_dir / f"beat_{beat_num:04d}.mp4"
            manager.update_progress_for_project(
                ctx,
                "compose_episode",
                episode,
                progress=index / max(1, len(beats)),
                current_task=f"合成 Beat {beat_num}...",
            )
            cmd = ["ffmpeg", "-y", "-i", str(video_path)]
            has_embedded_audio = False
            if audio_path.exists():
                cmd.extend(["-i", str(audio_path)])
                cmd.extend(
                    [
                        "-map",
                        "0:v:0",
                        "-map",
                        "1:a:0",
                        *ffmpeg_video_encoding_args(preset="fast", crf=23),
                        "-c:a",
                        "aac",
                        "-b:a",
                        "128k",
                        "-pix_fmt",
                        "yuv420p",
                        "-shortest",
                    ]
                )
                manager.update_progress_for_project(
                    ctx,
                    "compose_episode",
                    episode,
                    logs=[f"Beat {beat_num} 使用独立音频: {audio_path.name}"],
                )
            else:
                has_embedded_audio = _video_has_audio_stream(
                    video_path,
                    timeout_seconds=subprocess_timeout(30),
                )
                check_cancel()
            if has_embedded_audio:
                cmd.extend(
                    [
                        "-map",
                        "0:v:0",
                        "-map",
                        "0:a:0",
                        *ffmpeg_video_encoding_args(preset="fast", crf=23),
                        "-c:a",
                        "aac",
                        "-b:a",
                        "128k",
                        "-pix_fmt",
                        "yuv420p",
                        "-shortest",
                    ]
                )
                manager.update_progress_for_project(
                    ctx,
                    "compose_episode",
                    episode,
                    logs=[f"Beat {beat_num} 使用视频内置音轨"],
                )
            elif not audio_path.exists():
                cmd.extend(
                    [
                        "-f",
                        "lavfi",
                        "-i",
                        "anullsrc=r=44100:cl=stereo",
                        "-map",
                        "0:v:0",
                        "-map",
                        "1:a:0",
                        *ffmpeg_video_encoding_args(preset="fast", crf=23),
                        "-c:a",
                        "aac",
                        "-b:a",
                        "128k",
                        "-pix_fmt",
                        "yuv420p",
                        "-shortest",
                    ]
                )
            cmd.append(str(clip_path))
            result = run_checked(cmd, default_timeout_seconds=30 * 60)
            check_cancel()
            if result.returncode == 0:
                video_clips.append(str(clip_path))
            else:
                manager.update_progress_for_project(
                    ctx,
                    "compose_episode",
                    episode,
                    logs=[f"Beat {beat_num} 合成失败: {result.stderr[:500]}"],
                )

        if not video_clips:
            raise RuntimeError("没有可用的视频片段")

        check_cancel()
        cmd = ["ffmpeg", "-y"]
        for clip in video_clips:
            cmd.extend(["-i", clip])
        filter_parts = []
        for index in range(len(video_clips)):
            filter_parts.append(
                f"[{index}:v]scale={target_width}:{target_height}:"
                f"force_original_aspect_ratio=decrease,"
                f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black,"
                f"setsar=1,format=yuv420p[v{index}]"
            )
            filter_parts.append(f"[{index}:a]aresample=44100[a{index}]")
        concat_inputs = "".join(
            f"[v{index}][a{index}]" for index in range(len(video_clips))
        )
        filter_parts.append(
            f"{concat_inputs}concat=n={len(video_clips)}:v=1:a=1[outv][outa]"
        )
        cmd.extend(
            [
                "-filter_complex",
                ";".join(filter_parts),
                "-map",
                "[outv]",
                "-map",
                "[outa]",
                *ffmpeg_video_encoding_args(preset="fast", crf=23),
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                str(output_path),
            ]
        )
        result = run_checked(cmd, default_timeout_seconds=30 * 60)
        check_cancel()
        if result.returncode != 0:
            raise RuntimeError(f"拼接失败: {result.stderr[:500]}")

    return {
        "video_path": output_path.as_posix(),
        "add_subtitles_requested": add_subtitles,
    }


register_project_task_runner("compose_episode", run_compose_episode)


async def _run_global_optimize_video_async(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.narrative_planning.public import (
        generate_and_save_beat_video_prompt,
        sort_beats_for_display,
    )
    from ai_anime.modules.production.public import (
        get_global_video_optimizer,
        prepare_global_optimizer_input,
    )
    from ai_anime.shared.infrastructure.project_stores import (
        make_cognee_store_for_context,
    )
    from ai_anime.shared.utils.path_resolver import PathResolver

    payload = envelope.get("payload") or {}
    episode = int(envelope.get("episode") or payload.get("episode") or 0)
    beats = list(payload.get("beats") or [])
    characters = list(payload.get("characters") or [])
    output_dir = str(payload.get("output_dir") or ctx.output_dir)
    language = str(payload.get("language") or "zh")
    manager = get_task_manager()

    def log(message: str, *, progress: float | None = None) -> None:
        manager.update_progress_for_project(
            ctx,
            GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
            episode,
            progress=progress,
            current_task=message,
            logs=[message],
        )

    log("开始全局视频提示词优化...", progress=0.02)
    store = await make_cognee_store_for_context(
        ctx,
        load_graph_state=True,
    )
    try:
        reference_paths, color_map, _total_beats = prepare_global_optimizer_input(
            beats=beats,
            characters=characters,
            output_dir=output_dir,
            episode=episode,
            project=ctx.project_name,
        )
        if not reference_paths:
            raise RuntimeError("找不到可用的渲染图或草图，请先生成镜头画面")

        resolver = PathResolver(output_dir, episode)
        optimizer = get_global_video_optimizer()
        sorted_beats = list(sort_beats_for_display(beats))
        updated_count = 0
        failure_messages: list[str] = []
        prev_prompt = None

        for index, beat in enumerate(sorted_beats):
            beat_num = int(beat.get("beat_number") or 0)
            log(
                f"Beat {beat_num}/{len(sorted_beats)}: 生成视频提示词...",
                progress=0.2 + 0.7 * index / max(1, len(sorted_beats)),
            )
            sketch_path = None
            for candidate in (
                resolver.frame(beat_num),
                resolver.sketch(beat_num),
            ):
                if candidate.exists():
                    sketch_path = str(candidate)
                    break
            if not sketch_path:
                log(f"Beat {beat_num}: 无草图帧，跳过")
                continue

            prev_beat = sorted_beats[index - 1] if index > 0 else None
            next_beat = (
                sorted_beats[index + 1] if index < len(sorted_beats) - 1 else None
            )
            try:
                requested_mode = str(
                    beat.get("video_mode") or "first_frame"
                ).strip()
                if requested_mode == "keyframe" and next_beat is not None:
                    generated = await generate_and_save_beat_video_prompt(
                        store,
                        output_dir=output_dir,
                        project_name=ctx.project_name,
                        episode_num=episode,
                        beat_num=beat_num,
                        language=language,
                    )
                    prompt = generated.prompt
                    beat["video_mode"] = "keyframe"
                    beat["keyframe_prompt"] = prompt
                    updated_count += 1
                    prev_prompt = prompt
                    continue

                result = await optimizer.optimize_single_beat(
                    beat=beat,
                    sketch_image_path=sketch_path,
                    character_color_map=color_map,
                    language=language,
                    prev_beat=prev_beat,
                    next_beat=next_beat,
                    prev_prompt=prev_prompt,
                    beat_position=index + 1,
                    total_beats=len(sorted_beats),
                )
                prompt = result["prompt"]
                beat["video_mode"] = "first_frame"
                beat["video_prompt"] = prompt
                beat["keyframe_prompt"] = None
                await store.update_beat_asset(
                    episode_number=episode,
                    beat_number=beat_num,
                    video_mode="first_frame",
                    video_prompt=prompt,
                    keyframe_prompt=None,
                )
                updated_count += 1
                prev_prompt = prompt
            except Exception as exc:  # noqa: BLE001
                failure_messages.append(f"Beat {beat_num}: {exc}")
                log(f"Beat {beat_num}: 生成失败 ({exc})")

        if updated_count == 0:
            error = f"全局优化失败：0/{len(sorted_beats)} 个 Beat 生成成功"
            if failure_messages:
                error = f"{error}；最后错误：{failure_messages[-1]}"
            raise RuntimeError(error)

        log(
            f"全局优化完成：成功更新 {updated_count}/{len(sorted_beats)} 个 Beat",
            progress=1.0,
        )
        return {"optimized": updated_count, "beats": beats}
    finally:
        await store.close()


def run_global_optimize_video(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_global_optimize_video_async(envelope, ctx),
            envelope,
            task_type=GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
        )
    )


register_project_task_runner(
    GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
    run_global_optimize_video,
)


async def _run_freezone_video_gen_async(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    from ai_anime.shared.project_media import make_static_url_for_context
    from ai_anime.modules.creative_canvas.public import (
        GenerateCreativeCanvasVideoJobCommand,
        creative_canvas_job_execution_use_cases,
    )

    payload = envelope.get("payload") or {}
    job_id = str(payload["job_id"])
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))

    manager = get_task_manager()
    manager.update_progress_for_project(
        ctx,
        "freezone_video_gen",
        0,
        scope=job_id,
        progress=0.1,
        current_task="调用视频生成器...",
        logs=["开始 freezone 视频生成"],
    )

    try:
        out_path = await creative_canvas_job_execution_use_cases().generate_video(
            GenerateCreativeCanvasVideoJobCommand(
                project_dir=project_dir,
                job_id=job_id,
                prompt=str(payload.get("prompt") or ""),
                model=str(payload.get("video_model") or ""),
                model_role=str(payload.get("model_role") or ""),
                model_selector=str(payload.get("model_id") or "") or None,
                reference_items=tuple(payload.get("reference_items") or ()),
                aspect_ratio=str(payload.get("aspect_ratio") or "16:9"),
                resolution=str(payload.get("resolution") or "720p"),
                duration_seconds=int(payload.get("duration_seconds") or 5),
                generate_audio=bool(payload.get("generate_audio")),
                human_review=bool(payload.get("human_review")),
                scene_optimize=str(payload.get("scene_optimize") or ""),
                extra_params=(
                    payload.get("extra_params")
                    if isinstance(payload.get("extra_params"), dict)
                    else None
                ),
                last_frame_path=payload.get("last_frame_path"),
                audio_setting=payload.get("audio_setting") or None,
            )
        )
    except Exception as exc:
        _append_freezone_video_node_history(
            ctx=ctx,
            project_dir=project_dir,
            payload=payload,
            job_id=job_id,
            error=str(exc),
        )
        raise

    rel = out_path.relative_to(project_dir).as_posix()
    result = {
        "job_id": job_id,
        "output_path": str(out_path),
        "output_url": make_static_url_for_context(ctx, rel),
    }
    history_record = _append_freezone_video_node_history(
        ctx=ctx,
        project_dir=project_dir,
        payload=payload,
        job_id=job_id,
        result=result,
    )
    if history_record:
        result["generation_history_record"] = history_record
    return result


def run_freezone_video_gen(
    envelope: dict[str, Any], ctx: ProjectContext
) -> dict[str, Any]:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_freezone_video_gen_async(envelope, ctx),
            envelope,
            task_type="freezone_video_gen",
        )
    )


register_project_task_runner("freezone_video_gen", run_freezone_video_gen)

"""流水线聚合状态端点。"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import get_sqlite_store, resolve_project_scope
from ai_anime.sqlite_store import SQLiteStore
from ai_anime.modules.task_execution.public import (
    beat_has_script_content,
    effective_task_status,
    get_task_manager,
    parse_task_timestamp,
    project_task_use_cases,
)
from ai_anime.modules.production.public import (
    build_episode_audio_generation_plan,
    collect_video_reference_prereq_errors,
    inspect_episode_visual_assets,
    stale_canonical_sketch_numbers,
)
from ai_anime.shared.utils.async_ops import call_blocking
from ai_anime.shared.utils.path_resolver import (
    compute_portrait_path,
)

router = APIRouter()


_STEP_MAP = {
    "ingest": ("ingest_fast", "小说摄入"),
    "configure": (None, "配置项目"),
    "characters": ("build_characters", "角色提取"),
    "episodes": ("build_episodes", "分集规划"),
    "portraits": (None, "肖像生成"),
    "identity_plan": ("identity_planner", "身份规划"),
    "identity_images": (None, "身份图生成"),
    "scene_plan": ("episode_scene_planner", "场景规划"),
    "script": ("script_writer", "脚本生成"),
    "prop_plan": ("episode_prop_planner", "道具规划"),
    "scene_images": (None, "场景参考图生成"),
    "prop_images": (None, "道具参考图生成"),
    "voice_assets": (None, "本集声线准备"),
    "sketches": ("sketch_generation", "草图生成"),
    "coloring": (None, "配色+身份/道具检测"),
    "first_frames": ("selected_regen", "首帧生成"),
    "global_optimize": ("global_optimize_video", "全局视频优化"),
    "video_prompt_optimization": (None, "最终视频提示词"),
    "tts": (None, "TTS 配音"),
    "video": ("single_video", "视频生成"),
    "compose": ("compose_episode", "合成导出"),
    "done": (None, "全部完成"),
}


def _all_or_empty(items: list[bool]) -> bool:
    return bool(items) and all(items)


def _user_has_configured(username: str, project: str) -> bool:
    from ai_anime.modules.project_workspace.public import load_project_config

    config = load_project_config(username, project)
    return bool(config.get("ethnicity") or config.get("narration_style"))


def _file_series_complete(directory: Path, suffix: str, count: int) -> bool:
    if count <= 0:
        return False
    return all(
        (directory / f"beat_{i + 1:02d}.{suffix}").exists() for i in range(count)
    )


def _beat_file_series_complete(directory: Path, suffix: str, beats: list[dict]) -> bool:
    beat_numbers = [
        int(beat.get("beat_number", 0) or 0)
        for beat in beats
        if int(beat.get("beat_number", 0) or 0) > 0
    ]
    if not beat_numbers:
        return False
    return all(
        (directory / f"beat_{beat_num:02d}.{suffix}").exists()
        for beat_num in beat_numbers
    )


def _beat_file_series_current(
    directory: Path,
    suffix: str,
    beats: list[dict],
    dependencies: tuple[tuple[Path, str], ...],
) -> bool:
    if not _beat_file_series_complete(directory, suffix, beats):
        return False
    for beat in beats:
        beat_num = int(beat.get("beat_number", 0) or 0)
        if beat_num <= 0:
            continue
        output = directory / f"beat_{beat_num:02d}.{suffix}"
        for dependency_dir, dependency_suffix in dependencies:
            dependency = dependency_dir / f"beat_{beat_num:02d}.{dependency_suffix}"
            if (
                dependency.exists()
                and output.stat().st_mtime_ns < dependency.stat().st_mtime_ns
            ):
                return False
    return True


def _advanced_video_prompts_required(username: str, project: str) -> bool:
    from ai_anime.modules.production.public import (
        resolve_video_generation_route,
        video_model_uses_advanced_reference_workflow,
    )

    try:
        route = resolve_video_generation_route(username, project)
    except (LookupError, ValueError):
        return False
    return video_model_uses_advanced_reference_workflow(route.model)


def _beat_has_video_prompt(beat: dict) -> bool:
    from ai_anime.modules.production.public import parse_video_config

    return bool(
        parse_video_config(beat.get("video_config_json")).final_prompt
    )


def _task_completed_after_files(task: object | None, paths: list[Path]) -> bool:
    if task is None or not paths or not all(path.exists() for path in paths):
        return False
    if effective_task_status(task) != "completed":
        return False
    completed_at = parse_task_timestamp(
        getattr(task, "completed_at", None) or getattr(task, "updated_at", None)
    )
    if completed_at is None:
        return False
    return completed_at.timestamp() >= max(path.stat().st_mtime for path in paths)


@router.get("/projects/{project}/pipeline/status")
async def pipeline_status(
    project: str,
    episode: Optional[int] = Query(
        None, description="指定集数，不传则自动检测最新活跃集"
    ),
    user: dict = Depends(get_api_user),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    username = resolved.username
    project_name = resolved.project_name
    project_dir = resolved.project_dir
    mgr = get_task_manager()

    characters = store.get_all_characters()
    episodes = store.get_all_episodes()

    ingest_task = (
        mgr.get_task_for_project(resolved.ctx, "ingest_fast", 0)
        if resolved.ctx
        else mgr.get_task("ingest_fast", username, project_name, 0)
    )
    ingested = (
        bool(ingest_task and ingest_task.status == "completed")
        or bool(characters)
        or bool(episodes)
    )
    configured = _user_has_configured(username, project_name)
    portraits_done = bool(characters) and all(
        bool(compute_portrait_path(project_dir, c.name)) for c in characters
    )

    global_status = {
        "ingested": ingested,
        "configured": configured,
        "characters": len(characters),
        "episodes": len(episodes),
        "portraits_done": portraits_done,
    }

    if not (ingested and configured and characters and episodes):
        if not ingested:
            next_step = "ingest"
        elif not configured:
            next_step = "configure"
        elif not characters:
            next_step = "characters"
        elif not episodes:
            next_step = "episodes"
        task_type, step_name = _STEP_MAP[next_step]
        return {
            "ok": True,
            "data": {
                "project": project,
                "global": global_status,
                "current_episode": None,
                "episode_status": None,
                "next_step": task_type or next_step,
                "next_step_name": step_name,
            },
        }

    target_ep = episode
    if target_ep is None:
        unfinished = [
            ep.number
            for ep in sorted(episodes, key=lambda item: getattr(item, "number", 0))
            if not (
                project_dir / "videos" / "episodes" / f"ep{ep.number:03d}_final.mp4"
            ).exists()
        ]
        target_ep = (
            unfinished[0]
            if unfinished
            else max((ep.number for ep in episodes), default=1)
        )

    target_episode = store.get_episode(target_ep)
    beats = await store.get_beats_as_dicts(target_ep)
    identity_ids = set(getattr(target_episode, "identity_ids", []) or [])
    scenes = list(await store.list_scenes() or []) if hasattr(store, "list_scenes") else []
    props = list(await store.list_props() or []) if hasattr(store, "list_props") else []
    prop_plan_task = None
    if resolved.ctx:
        prop_plan_task = next(
            (
                task
                for task in project_task_use_cases().list_for_project(resolved.ctx)
                if task.task_type == "episode_prop_planner"
                and task.episode == target_ep
            ),
            None,
        )
    else:
        prop_plan_task = mgr.get_task(
            "episode_prop_planner",
            username,
            project_name,
            target_ep,
            scope=f"prop_run_ep{target_ep:03d}",
        ) or mgr.get_task(
            "episode_prop_planner",
            username,
            project_name,
            target_ep,
        )
    readiness = inspect_episode_visual_assets(
        project_dir=project_dir,
        episode=target_episode,
        characters=characters,
        scenes=scenes,
        props=props,
        beats=beats,
        prop_plan_completed=(
            prop_plan_task is not None
            and effective_task_status(prop_plan_task) == "completed"
        ),
    )
    has_script = _all_or_empty([beat_has_script_content(b) for b in beats])

    sketches_dir = project_dir / "sketches" / f"ep{target_ep:03d}"
    sketch_paths = [
        sketches_dir / f"beat_{int(beat['beat_number']):02d}.png"
        for beat in beats
        if int(beat.get("beat_number", 0) or 0) > 0
    ]
    sketch_colors = store.get_sketch_colors(target_ep) or {}
    stale_sketch_beats = stale_canonical_sketch_numbers(
        project_dir,
        target_ep,
        beats,
        sketch_colors=sketch_colors,
    )
    has_sketches = readiness.ready_for_sketches and not stale_sketch_beats

    detection_task = (
        mgr.get_task_for_project(
            resolved.ctx,
            "ai_identity_detection",
            target_ep,
        )
        if resolved.ctx
        else mgr.get_task(
            "ai_identity_detection",
            username,
            project_name,
            target_ep,
        )
    )
    has_coloring = (
        has_sketches
        and bool(sketch_colors)
        and identity_ids.issubset(set(sketch_colors))
        and _task_completed_after_files(detection_task, sketch_paths)
        and _all_or_empty(
            [
                b.get("detected_identities") is not None
                and b.get("detected_props") is not None
                for b in beats
            ]
        )
    )
    has_global_optimize = _all_or_empty(
        [bool(b.get("video_mode")) and bool(b.get("video_prompt")) for b in beats]
    )
    frames_dir = project_dir / "frames" / f"ep{target_ep:03d}"
    audio_dir = project_dir / "audio" / f"ep{target_ep:03d}"
    videos_dir = project_dir / "videos" / "beats" / f"ep{target_ep:03d}"
    advanced_video_prompts_required = _advanced_video_prompts_required(
        username,
        project_name,
    )
    missing_video_prompt_beats = (
        [
            int(beat.get("beat_number") or 0)
            for beat in beats
            if int(beat.get("beat_number") or 0) > 0
            and not _beat_has_video_prompt(beat)
        ]
        if advanced_video_prompts_required
        else []
    )

    audio_plan = None
    voice_asset_issues: list[str] = []
    if has_script:
        # Use the same speech/voice plan as generation: silent beats and unused
        # library characters do not require voices or an audio output file.
        audio_plan = await build_episode_audio_generation_plan(
            store=store,
            username=username,
            project=project_name,
            episode=target_ep,
            beat_numbers=None,
            mode="sync_changed",
        )
        voice_asset_issues.extend(audio_plan.errors)
        if advanced_video_prompts_required:
            reference_errors = await call_blocking(
                collect_video_reference_prereq_errors,
                project_output=project_dir,
                episode=target_ep,
                beats=beats,
                characters=characters,
            )
            voice_asset_issues.extend(
                f"Beat {error.beat_number} {error.label}：{error.reason}"
                for error in reference_errors
                if error.media_type == "audio"
            )
    voice_asset_issues = list(dict.fromkeys(voice_asset_issues))

    episode_status = {
        "identity_plan": readiness.identity_plan_complete,
        "scene_plan": readiness.scene_plan_complete,
        "script": has_script,
        "prop_plan": readiness.prop_plan_complete,
        "identity_images": readiness.identity_images_complete,
        "scene_images": readiness.scene_images_complete,
        "prop_images": readiness.prop_images_complete,
        "voice_assets": has_script and not voice_asset_issues,
        "sketches": has_sketches,
        "coloring": has_coloring,
        "first_frames": _beat_file_series_current(
            frames_dir,
            "png",
            beats,
            ((sketches_dir, "png"),),
        ),
        "global_optimize": has_global_optimize,
        "video_prompt_optimization": not missing_video_prompt_beats,
        "tts": (
            audio_plan is not None
            and not audio_plan.errors
            and not audio_plan.beat_numbers
        ),
        "video": _beat_file_series_current(
            videos_dir,
            "mp4",
            beats,
            ((frames_dir, "png"), (audio_dir, "mp3")),
        ),
    }

    next_step = "done"
    for key in (
        "identity_plan",
        "scene_plan",
        "script",
        "prop_plan",
        "identity_images",
        "scene_images",
        "prop_images",
        "voice_assets",
        "sketches",
        "coloring",
        "first_frames",
        "global_optimize",
        "video_prompt_optimization",
        "tts",
        "video",
    ):
        if not episode_status[key]:
            next_step = key
            break
    if (
        next_step == "done"
        and not (
            project_dir / "videos" / "episodes" / f"ep{target_ep:03d}_final.mp4"
        ).exists()
    ):
        next_step = "compose"

    task_type, step_name = _STEP_MAP[next_step]
    return {
        "ok": True,
        "data": {
            "project": project,
            "global": global_status,
            "current_episode": target_ep,
            "episode_status": episode_status,
            "visual_asset_issues": list(readiness.issues),
            "voice_asset_issues": voice_asset_issues,
            "stale_sketch_beats": stale_sketch_beats,
            "missing_video_prompt_beats": missing_video_prompt_beats,
            "next_step": task_type or next_step,
            "next_step_name": step_name,
        },
    }

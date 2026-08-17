"""Client-safe project task projection."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.domain.project_task import (
    ProjectTask,
    effective_task_status,
)
from ai_anime.modules.task_execution.domain.task_identity import (
    project_task_state_key,
    task_state_key,
)
from ai_anime.modules.task_execution.domain.task_time import parse_task_timestamp
from ai_anime.shared.utils.static_urls import project_static_url

_TASK_TYPE_LABELS = {
    "ingest_fast": "快速导入",
    "build_characters": "构建角色",
    "build_scenes": "构建场景",
    "build_props": "构建道具",
    "build_episodes": "规划剧集",
    "identity_planner": "规划身份",
    "script_writer": "生成剧本",
    "script_workflow": "脚本生产图",
    "production_workflow": "完整生产工作流",
    "beat_video_prompt": "生成提示词",
    "literal_script_writer": "生成解说稿",
    "director_notes": "导演说明",
    "episode_scene_planner": "规划场景",
    "episode_prop_planner": "规划道具",
    "character_portrait": "角色定妆",
    "identity_image": "身份定妆",
    "scene_reference_asset": "场景参考图",
    "prop_reference_asset": "道具参考图",
    "style_preview": "风格参考图",
    "sketch_generation": "生成草图",
    "sketch_regen": "重生成草图",
    "mainline_sketch_from_context": "生成草图",
    "mainline_frame_from_context": "渲染分镜",
    "selected_regen": "重生成选区",
    "grid_regenerate": "重生成网格",
    "ai_identity_detection": "AI 角色检测",
    "single_video": "生成单镜视频",
    "global_optimize_video": "全局优化视频",
    "compose_episode": "合成剧集",
    "audio_generation": "生成音频",
    "indextts2_audio_generation": "生成音频",
    "audio_generation_indextts2": "生成音频",
    "freezone_video_gen": "自由区视频",
    "stage_asset": "场景资产",
    "freezone_gen": "AI anime 画布生成",
    "freezone_edit": "AI anime 画布编辑",
    "freezone_mask_edit": "局部编辑",
    "freezone_extract": "视频抽帧",
    "freezone_analyze": "视频分析",
    "freezone_video_story": "视频解读",
    "freezone_video_erase": "视频擦除",
    "freezone_video_upscale": "视频放大",
    "freezone_audio_separate": "音频分离",
    "freezone_video_compose": "视频合成",
    "freezone_text_translate": "字幕翻译",
    "freezone_story_script": "生成故事脚本",
    "freezone_script_to_video_plan": "脚本转视频计划",
    "freezone_audio_speech": "生成语音",
    "freezone_audio_eleven_music": "生成音乐",
    "freezone_image_to_3gs": "图片转世界",
    "freezone_image_reverse_prompt": "图片反推提示词",
    "batch_prop_ref": "批量道具参考图",
}
_STAGE_ASSET_STEP_LABELS = {
    "pano_from_master": "Master 生成全景",
    "pano_from_text": "文生全景",
    "pano_sharp": "全景转 SOG",
    "single_face_sharp": "单面转 SOG",
    "voxel_world_from_360": "全景转体素",
    "scene_360": "生成 360 全景",
    "upload_package": "上传场景包",
    "splat_collision": "生成碰撞体",
}


def _serialize_timestamp(value: str) -> str:
    parsed = parse_task_timestamp(value)
    if parsed is None:
        return str(value or "")
    return parsed.isoformat().replace("+00:00", "Z")


def _is_result_path_key(key: str) -> bool:
    lowered = str(key or "").lower()
    return lowered in {"path", "paths"} or lowered.endswith(
        ("_path", "_paths")
    )


def _url_key_for_path_key(key: str) -> str:
    if key == "path":
        return "url"
    if key == "paths":
        return "urls"
    if key.endswith("_paths"):
        return f"{key[:-6]}_urls"
    if key.endswith("_path"):
        return f"{key[:-5]}_url"
    return "url"


def _is_public_url_value(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered.startswith(
        ("/static/", "http://", "https://", "blob:", "data:")
    )


def _project_static_url_for_abs_path(
    context: ProjectContext,
    value: str,
) -> str | None:
    raw = str(value or "").strip()
    if not raw or _is_public_url_value(raw):
        return None
    path = Path(raw)
    if not path.is_absolute():
        return None
    try:
        resolved = path.resolve()
        relative = resolved.relative_to(Path(context.output_dir).resolve()).as_posix()
    except (OSError, ValueError):
        return None
    return project_static_url(context.project_id, relative, local_path=resolved)


def _is_local_abs_path_value(value: str) -> bool:
    raw = str(value or "").strip()
    return bool(raw) and not _is_public_url_value(raw) and Path(raw).is_absolute()


def _sanitize_result(value: Any, *, context: ProjectContext | None) -> Any:
    if context is None:
        return value
    if isinstance(value, list):
        return [_sanitize_result(item, context=context) for item in value]
    if not isinstance(value, dict):
        return value

    sanitized: dict[str, Any] = {}
    for key, item in value.items():
        key_text = str(key)
        if _is_result_path_key(key_text):
            url_key = _url_key_for_path_key(key_text)
            if isinstance(item, str):
                url = _project_static_url_for_abs_path(context, item)
                if url:
                    sanitized.setdefault(url_key, url)
                    continue
            if isinstance(item, list):
                urls = [
                    url
                    for url in (
                        _project_static_url_for_abs_path(context, path)
                        for path in item
                        if isinstance(path, str)
                    )
                    if url
                ]
                if urls:
                    sanitized.setdefault(url_key, urls)
                    continue
            if isinstance(item, str) and _is_local_abs_path_value(item):
                continue
            if isinstance(item, list) and any(
                isinstance(path, str) and _is_local_abs_path_value(path)
                for path in item
            ):
                continue
        sanitized[key_text] = _sanitize_result(item, context=context)
    return sanitized


def serialize_project_task(
    task: ProjectTask,
    *,
    context: ProjectContext | None = None,
) -> dict[str, Any]:
    metadata = task.metadata if isinstance(task.metadata, dict) else {}
    if task.project_id:
        key = project_task_state_key(
            task_type=task.task_type,
            project_id=task.project_id,
            episode=task.episode,
            beat_num=task.beat_num,
            scope=task.scope,
        )
    else:
        key = task_state_key(
            task_type=task.task_type,
            username=task.username,
            project=task.project,
            episode=task.episode,
            beat_num=task.beat_num,
            scope=task.scope,
        )
    task_type_label = _TASK_TYPE_LABELS.get(task.task_type, task.task_type)
    metadata_display_name = str(metadata.get("display_name") or "").strip()
    episode_label = f" · ep{task.episode}" if task.episode else ""
    display_name = metadata_display_name or f"{task_type_label}{episode_label}"
    if task.task_type == "stage_asset":
        scene_name = str(metadata.get("scene_name") or "").strip()
        step = str(metadata.get("step") or "").strip()
        step_label = _STAGE_ASSET_STEP_LABELS.get(step, step)
        display_parts = [task_type_label]
        if scene_name:
            display_parts.append(scene_name)
        if step_label:
            display_parts.append(step_label)
        display_name = " · ".join(display_parts)
    payload = asdict(task)
    for field_name in ("created_at", "updated_at", "completed_at", "expires_at"):
        payload[field_name] = _serialize_timestamp(payload.get(field_name, ""))
    payload["result"] = _sanitize_result(payload.get("result"), context=context)
    payload["status"] = effective_task_status(task)
    return {
        **payload,
        "error_code": metadata.get("error_code"),
        "task_key": key,
        "task_type_label": task_type_label,
        "display_name": display_name,
    }


__all__ = ["serialize_project_task"]

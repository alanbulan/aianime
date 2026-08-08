"""Single-beat image and frame verification endpoints."""

import json
import logging
import re

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import make_sqlite_store_for_context
from ai_anime.api.routes.verification.dependencies import (
    load_beat_data,
    resolve_verification_project,
)
from ai_anime.modules.verification.public import (
    FrameVerifier,
    ImageVerifier,
    VerifyRequest,
    find_frame_for_beat,
    find_sketch_for_beat,
    format_verification_report,
    resolve_verification_scene_context,
    save_verify_report,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/verify")
async def verify_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: VerifyRequest,
    user: dict = Depends(get_api_user),
):
    """验证单个 beat 的草图/首帧是否匹配描述。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "verify_beat: project=%s ep=%d beat=%d type=%s",
        project,
        episode_num,
        beat_num,
        body.type,
    )
    store = await make_sqlite_store_for_context(resolved.ctx)

    # 1. 读取 beat 数据
    try:
        beat = await load_beat_data(store, episode_num, beat_num)
    except (FileNotFoundError, IndexError) as e:
        return {"ok": False, "error": str(e)}

    # 2. 找到对应图片
    if body.type == "sketch":
        image_path = find_sketch_for_beat(project_dir, episode_num, beat_num)
    elif body.type == "frame":
        image_path = find_frame_for_beat(project_dir, episode_num, beat_num)
    else:
        return {"ok": False, "error": f"Unsupported verify type: {body.type}"}

    if not image_path:
        return {"ok": False, "error": f"No {body.type} image found for beat {beat_num}"}

    # 路径安全检查
    if not image_path.resolve().is_relative_to(project_dir.resolve()):
        return {"ok": False, "error": "Image path outside project directory"}

    # 3. 加载颜色映射（用于角色动作归属验证）
    color_mapping: dict[str, str] = {}
    scenes = []
    try:
        color_mapping = store.get_sketch_colors(episode_num) or {}
        scenes = await store.list_scenes()
    except Exception as e:
        # 无颜色映射/场景列表时退化为原有行为，但仍记录原因便于排查
        logger.debug("verify_beat: 颜色映射/场景列表读取失败，退化为默认行为: %s", e)

    # 4. 调用验证
    visual_desc = beat.get("visual_description", "")
    named_characters = re.findall(r"\{\{([^}]+)\}\}", visual_desc)
    camera_context = beat.get("keyframe_prompt") or beat.get("video_prompt", "")
    scene_context = resolve_verification_scene_context(
        project_dir,
        beat,
        episode_number=episode_num,
        scenes=scenes,
    )

    verifier = ImageVerifier()
    try:
        result = await verifier.verify_sketch(
            str(image_path),
            visual_desc,
            named_characters,
            scene_context["scene_id"],
            beat.get("time_of_day", ""),
            camera_context,
            color_mapping=color_mapping,
            resolved_scene_name=scene_context["resolved_scene_name"],
            time_baked=scene_context["time_baked"],
            prompt_time_of_day=scene_context["prompt_time_of_day"],
        )
    except Exception as e:
        logger.error("verify_beat failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 5. 构建响应数据
    data = {
        **result.model_dump(),
        "beat_number": beat_num,
        "verify_type": body.type,
        "image_path": image_path.relative_to(project_dir).as_posix(),
        "description_used": beat.get("visual_description", ""),
    }

    # 6. 格式化可读报告 + 持久化
    data["report_text"] = format_verification_report(
        result.model_dump(), beat_num, body.type
    )
    report_path = save_verify_report(
        project_dir, episode_num, beat_num, body.type, data
    )
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/verify-frame")
async def verify_frame(
    project: str,
    episode_num: int,
    beat_num: int,
    user: dict = Depends(get_api_user),
):
    """验证单个 beat 的首帧渲染质量（对比草图）。"""
    resolved = await resolve_verification_project(project, user, required_role="viewer")
    project_dir = resolved.project_dir
    logger.info(
        "verify_frame: project=%s ep=%d beat=%d", project, episode_num, beat_num
    )
    store = await make_sqlite_store_for_context(resolved.ctx)

    # 1. 读取 beat 数据
    try:
        beat = await load_beat_data(store, episode_num, beat_num)
    except (FileNotFoundError, IndexError) as e:
        return {"ok": False, "error": str(e)}

    # 2. 找到首帧和草图
    frame_path = find_frame_for_beat(project_dir, episode_num, beat_num)
    if not frame_path:
        return {"ok": False, "error": f"No frame image found for beat {beat_num}"}

    sketch_path = find_sketch_for_beat(project_dir, episode_num, beat_num)
    if not sketch_path:
        return {
            "ok": False,
            "error": f"No sketch image found for beat {beat_num} (needed for comparison)",
        }

    # 路径安全检查
    resolved_project = project_dir.resolve()
    if not frame_path.resolve().is_relative_to(resolved_project):
        return {"ok": False, "error": "Frame path outside project directory"}
    if not sketch_path.resolve().is_relative_to(resolved_project):
        return {"ok": False, "error": "Sketch path outside project directory"}

    # 3. 读取项目视觉风格
    project_style = ""
    project_config_path = project_dir / "config.json"
    if project_config_path.exists():
        try:
            config_data = json.loads(project_config_path.read_text(encoding="utf-8"))
            project_style = config_data.get("visual_style", "")
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Failed to load config.json for project style: %s", e)

    # 4. 调用验证
    visual_desc = beat.get("visual_description", "")
    verifier = FrameVerifier()
    try:
        result = await verifier.verify_frame(
            str(frame_path),
            str(sketch_path),
            visual_desc,
            project_style,
        )
    except Exception as e:
        logger.error("verify_frame failed: %s", e, exc_info=True)
        return {"ok": False, "error": str(e)}

    # 5. 构建响应数据
    data = {
        **result.model_dump(),
        "beat_number": beat_num,
        "verify_type": "frame",
        "frame_path": frame_path.relative_to(project_dir).as_posix(),
        "sketch_path": sketch_path.relative_to(project_dir).as_posix(),
        "description_used": visual_desc,
    }

    # 6. 格式化可读报告 + 持久化
    data["report_text"] = format_verification_report(
        result.model_dump(), beat_num, "frame"
    )
    report_path = save_verify_report(project_dir, episode_num, beat_num, "frame", data)
    data["report_path"] = report_path.relative_to(project_dir).as_posix()

    return {"ok": True, "data": data}

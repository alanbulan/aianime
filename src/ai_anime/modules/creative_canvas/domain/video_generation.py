"""Creative Canvas video generation rules."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

MIN_OMNI_REFERENCE_AUDIO_SECONDS = 1.8
MAX_OMNI_REFERENCE_AUDIO_SECONDS = 15.2
MAX_OMNI_REFERENCE_AUDIO_TOTAL_SECONDS = 15.2

CreativeCanvasVideoRequestedMode = Literal[
    "textToVideo",
    "firstFrame",
    "imageToVideo",
    "imageReference",
    "firstLastFrame",
    "allReference",
    "videoEdit",
]
CreativeCanvasVideoExecutionMode = Literal[
    "text_to_video",
    "first_frame",
    "image_reference",
    "first_last_frame",
    "all_reference",
    "video_edit",
]


@dataclass(frozen=True)
class CreativeCanvasVideoModeContract:
    execution_mode: CreativeCanvasVideoExecutionMode
    model_role: str


_VIDEO_MODE_CONTRACTS: dict[
    CreativeCanvasVideoRequestedMode,
    CreativeCanvasVideoModeContract,
] = {
    "textToVideo": CreativeCanvasVideoModeContract(
        execution_mode="text_to_video",
        model_role="VIDEO_TEXT_TO_VIDEO",
    ),
    "firstFrame": CreativeCanvasVideoModeContract(
        execution_mode="first_frame",
        model_role="VIDEO_IMAGE_TO_VIDEO",
    ),
    "imageToVideo": CreativeCanvasVideoModeContract(
        execution_mode="image_reference",
        model_role="VIDEO_IMAGE_REFERENCE",
    ),
    "imageReference": CreativeCanvasVideoModeContract(
        execution_mode="image_reference",
        model_role="VIDEO_IMAGE_REFERENCE",
    ),
    "firstLastFrame": CreativeCanvasVideoModeContract(
        execution_mode="first_last_frame",
        model_role="VIDEO_FIRST_LAST_FRAME",
    ),
    "allReference": CreativeCanvasVideoModeContract(
        execution_mode="all_reference",
        model_role="VIDEO_ALL_REFERENCE",
    ),
    "videoEdit": CreativeCanvasVideoModeContract(
        execution_mode="video_edit",
        model_role="VIDEO_EDIT",
    ),
}


def resolve_video_generation_mode(
    requested_mode: CreativeCanvasVideoRequestedMode,
) -> CreativeCanvasVideoModeContract:
    return _VIDEO_MODE_CONTRACTS[requested_mode]

VIDEO_CAMERA_TEMPLATES: tuple[dict[str, str], ...] = (
    {
        "id": "locked_off",
        "name": "固定镜头",
        "prompt": "镜头固定，机位稳定，不推不摇不移，由角色和环境自然完成表演。",
    },
    {
        "id": "follow_tracking",
        "name": "跟随拍摄",
        "prompt": "镜头持续跟随主体移动，保持主角始终处于视觉中心，运动自然顺滑。",
    },
    {
        "id": "orbit_up",
        "name": "盘旋抬升",
        "prompt": "镜头围绕主体盘旋，同时缓慢抬升，营造空间展开和情绪提升。",
    },
    {
        "id": "orbit_down",
        "name": "盘旋下降",
        "prompt": "镜头围绕主体盘旋，同时缓慢下降，营造压迫感和沉浸式包围。",
    },
    {
        "id": "tilt_up",
        "name": "镜头上摇",
        "prompt": "镜头从下往上平滑上摇，逐步揭示主体上方信息与空间高度。",
    },
    {
        "id": "tilt_down",
        "name": "镜头下摇",
        "prompt": "镜头从上往下平滑下摇，逐步聚焦主体动作与地面细节。",
    },
    {
        "id": "pan_left",
        "name": "镜头左摇",
        "prompt": "镜头向左平滑横摇，带出画面左侧环境与叙事信息。",
    },
    {
        "id": "pan_right",
        "name": "镜头右摇",
        "prompt": "镜头向右平滑横摇，带出画面右侧环境与叙事信息。",
    },
    {
        "id": "pedestal_up",
        "name": "镜头上升",
        "prompt": "镜头整体垂直上升，视角逐步抬高，增强空间层次和临场感。",
    },
    {
        "id": "pedestal_down",
        "name": "镜头下降",
        "prompt": "镜头整体垂直下降，视角逐步压低，强化人物压迫和沉浸感。",
    },
    {
        "id": "truck_left",
        "name": "镜头左移",
        "prompt": "镜头整体向左平移，保持运镜稳定，突出场景横向调度。",
    },
    {
        "id": "truck_right",
        "name": "镜头右移",
        "prompt": "镜头整体向右平移，保持运镜稳定，突出场景横向调度。",
    },
)


def get_video_camera_templates() -> list[dict[str, str]]:
    return [dict(item) for item in VIDEO_CAMERA_TEMPLATES]


def get_video_camera_template(template_id: str | None) -> dict[str, str] | None:
    if not template_id:
        return None
    for item in VIDEO_CAMERA_TEMPLATES:
        if item["id"] == template_id:
            return dict(item)
    return None


def normalize_video_aspect_ratio(value: str | None) -> str:
    text = str(value or "").strip().lower()
    if not text or text == "auto":
        return "16:9"
    return text


def normalize_video_resolution(value: str | None) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "720p"
    return text


def _coarse_mark_region(mark: dict[str, Any]) -> str:
    px = mark.get("point_x")
    py = mark.get("point_y")
    if not isinstance(px, (int, float)) or not isinstance(py, (int, float)):
        box_x = mark.get("box_x")
        box_y = mark.get("box_y")
        box_width = mark.get("box_width")
        box_height = mark.get("box_height")
        if all(
            isinstance(value, (int, float))
            for value in [box_x, box_y, box_width, box_height]
        ):
            px = float(box_x) + float(box_width) / 2.0
            py = float(box_y) + float(box_height) / 2.0
    if isinstance(px, (int, float)) and isinstance(py, (int, float)):
        horizontal = "左侧" if px < 0.33 else "右侧" if px > 0.66 else "中部"
        vertical = "上方" if py < 0.33 else "下方" if py > 0.66 else "中间"
        return f"{horizontal}{vertical}"
    return ""


def format_video_marks(marks: list[dict[str, Any]] | None) -> str:
    clean_marks = [
        mark for mark in (marks or []) if str(mark.get("label") or "").strip()
    ]
    if not clean_marks:
        return ""

    lines: list[str] = []
    for mark in clean_marks:
        label = str(mark.get("label") or "").strip()
        region = _coarse_mark_region(mark)
        note = str(mark.get("note") or "").strip()
        suffix_parts = [part for part in [region, note] if part]
        suffix = f"（{'，'.join(suffix_parts)}）" if suffix_parts else ""
        lines.append(f"- {label}{suffix}")
    return "重点元素标记：\n" + "\n".join(lines)


def build_freezone_video_prompt(
    *,
    user_prompt: str,
    camera_template_id: str | None = None,
    character_names: list[str] | None = None,
    marks: list[dict[str, Any]] | None = None,
) -> str:
    parts = [str(user_prompt or "").strip()]
    template = get_video_camera_template(camera_template_id)
    if template:
        parts.append(f"运镜模板：{template['name']}。{template['prompt']}")
    if character_names:
        joined = "、".join(name for name in character_names if name)
        if joined:
            parts.append(
                f"角色一致性要求：保持 {joined} 的外观、服装和身份特征稳定一致。"
            )
    marks_block = format_video_marks(marks)
    if marks_block:
        parts.append(marks_block)
    parts.append(
        "输出要求：生成单条连贯视频镜头，动作自然，运动平滑，避免闪烁、变形、跳帧和主体身份漂移。"
    )
    return "\n".join(part for part in parts if part)


def build_freezone_image_to_video_prompt(
    *,
    user_prompt: str = "",
    camera_template_id: str | None = None,
    marks: list[dict[str, Any]] | None = None,
    reference_image_count: int = 1,
) -> str:
    parts: list[str] = []
    if user_prompt and user_prompt.strip():
        parts.append(user_prompt.strip())
    template = get_video_camera_template(camera_template_id)
    if template:
        parts.append(f"运镜模板：{template['name']}。{template['prompt']}")
    marks_block = format_video_marks(marks)
    if marks_block:
        parts.append(marks_block)
    if int(reference_image_count or 1) > 1:
        parts.append(
            "图片参考约束：综合参考多张输入图片，优先保持主体身份、外观、服装、场景线索与整体风格一致，"
            "不要把多张图拼贴成多画面。"
        )
    else:
        parts.append(
            "首帧约束：严格继承输入图片中的主体、构图、服装、光线和场景信息，把输入图作为视频首帧参考。"
        )
    parts.append(
        "输出要求：生成单条连贯视频镜头，动作自然，运动平滑，避免闪烁、变形、跳帧、主体身份漂移和首帧偏移。"
    )
    return "\n".join(part for part in parts if part)


def build_freezone_keyframe_video_prompt(
    *,
    user_prompt: str = "",
    camera_template_id: str | None = None,
    marks: list[dict[str, Any]] | None = None,
    has_first_frame: bool = True,
    has_last_frame: bool = True,
) -> str:
    parts: list[str] = []
    if user_prompt and user_prompt.strip():
        parts.append(user_prompt.strip())
    template = get_video_camera_template(camera_template_id)
    if template:
        parts.append(f"运镜模板：{template['name']}。{template['prompt']}")
    marks_block = format_video_marks(marks)
    if marks_block:
        parts.append(marks_block)
    if has_first_frame and has_last_frame:
        parts.append(
            "首尾帧约束：严格从首帧自然过渡到尾帧，保持主体身份、构图逻辑、光线与场景连续。"
        )
    elif has_first_frame:
        parts.append(
            "首帧约束：严格继承输入图片中的主体、构图、服装、光线和场景信息，把输入图作为视频首帧参考。"
        )
    elif has_last_frame:
        parts.append(
            "尾帧约束：以输入图片作为目标收束画面，确保镜头最终自然落到该主体状态和构图。"
        )
    parts.append(
        "输出要求：生成单条连贯视频镜头，动作自然，运动平滑，避免闪烁、变形、跳帧、主体身份漂移和首尾帧跳变。"
    )
    return "\n".join(part for part in parts if part)


def build_freezone_omni_video_prompt(
    *,
    user_prompt: str,
    theme: str = "",
    camera_template_id: str | None = None,
    marks: list[dict[str, Any]] | None = None,
) -> str:
    parts = [str(user_prompt or "").strip()]
    if theme and theme.strip():
        parts.append(f"主题要求：{theme.strip()}")
    template = get_video_camera_template(camera_template_id)
    if template:
        parts.append(f"运镜模板：{template['name']}。{template['prompt']}")
    marks_block = format_video_marks(marks)
    if marks_block:
        parts.append(marks_block)
    parts.append(
        "全能参考模式要求：综合文本、图像、视频和音频参考进行统一建模，优先保持主体身份、场景连续性、风格一致性和动作自然性。"
    )
    parts.append(
        "输出要求：生成单条连贯视频镜头，动作自然，运动平滑，避免闪烁、变形、跳帧和主体身份漂移。"
    )
    return "\n".join(part for part in parts if part)


def summarize_omni_reference_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    image_count = sum(1 for item in items if str(item.get("type")) == "image")
    video_count = sum(1 for item in items if str(item.get("type")) == "video")
    audio_count = sum(1 for item in items if str(item.get("type")) == "audio")
    return {
        "image_count": image_count,
        "video_count": video_count,
        "audio_count": audio_count,
        "total_count": image_count + video_count + audio_count,
    }


def validate_omni_reference_limits(items: list[dict[str, Any]]) -> None:
    counts = summarize_omni_reference_counts(items)
    if counts["total_count"] > 12:
        raise ValueError("references total count must be <= 12")
    if counts["image_count"] > 9:
        raise ValueError("image references count must be <= 9")
    if counts["video_count"] > 3:
        raise ValueError("video references count must be <= 3")
    if counts["audio_count"] > 3:
        raise ValueError("audio references count must be <= 3")


def _format_seconds(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _exceeds(value: float, limit: float) -> bool:
    return round(value - limit, 3) > 0


def validate_reference_media_durations(
    durations: list[tuple[str, float | None]],
    *,
    min_seconds: float | None,
    max_seconds: float | None,
    total_min_seconds: float | None,
    total_max_seconds: float | None,
    media_label: str,
) -> None:
    measured = [
        (label, float(seconds))
        for label, seconds in durations
        if isinstance(seconds, (int, float))
        and not isinstance(seconds, bool)
        and math.isfinite(seconds)
        and seconds > 0
    ]
    if not measured:
        return

    def clips(items: list[tuple[str, float]]) -> str:
        return ", ".join(
            f"{label} ({_format_seconds(value)}s)" for label, value in items
        )

    if min_seconds is not None:
        too_short = [item for item in measured if _exceeds(min_seconds, item[1])]
        if too_short:
            raise ValueError(
                f"{media_label} reference duration must be >= "
                f"{_format_seconds(min_seconds)}s: " + clips(too_short)
            )
    if max_seconds is not None:
        too_long = [item for item in measured if _exceeds(item[1], max_seconds)]
        if too_long:
            raise ValueError(
                f"{media_label} reference duration must be <= "
                f"{_format_seconds(max_seconds)}s: " + clips(too_long)
            )
    total = sum(value for _, value in measured)
    if (
        total_min_seconds is not None
        and len(measured) == len(durations)
        and _exceeds(total_min_seconds, total)
    ):
        raise ValueError(
            f"{media_label} references total duration must be >= "
            f"{_format_seconds(total_min_seconds)}s, got {_format_seconds(total)}s: "
            + clips(measured)
        )
    if total_max_seconds is not None and _exceeds(total, total_max_seconds):
        raise ValueError(
            f"{media_label} references total duration must be <= "
            f"{_format_seconds(total_max_seconds)}s, got {_format_seconds(total)}s: "
            + clips(measured)
        )

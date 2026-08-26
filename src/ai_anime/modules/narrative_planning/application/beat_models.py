"""Persisted beat models owned by Narrative Planning."""

import json
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class SceneRef(BaseModel):
    """Beat 内引用的场景资产。"""

    scene_id: str = Field(default="", description="场景 ID")
    variant_id: str = Field(default="", description="场景外观/状态选择器；为空表示基础场景")
    render_anchor_id: str = Field(
        default="",
        description="Beat 实际 render 背景槽位；为空表示默认场景图，selected_background 表示使用 beat 冻结背景",
    )
    render_anchor_source_id: str = Field(
        default="",
        description="当 render_anchor_id=selected_background 时记录截图来源，如 master/reverse/director_env_only",
    )


def _coerce_scene_ref(value: Any) -> SceneRef | None:
    if isinstance(value, SceneRef):
        return value if value.scene_id else None
    if isinstance(value, dict):
        scene_id = str(value.get("scene_id", "") or value.get("base_id", "")).strip()
        variant_id = str(value.get("variant_id", "") or "").strip()
        render_anchor_id = str(
            value.get("render_anchor_id", "")
            or value.get("anchor_id", "")
            or value.get("background_ref_id", "")
            or value.get("shot_id", "")
            or ""
        ).strip()
        render_anchor_source_id = str(
            value.get("render_anchor_source_id", "")
            or value.get("anchor_source_id", "")
            or value.get("background_ref_source_id", "")
            or ""
        ).strip()
        return (
            SceneRef(
                scene_id=scene_id,
                variant_id=variant_id,
                render_anchor_id=render_anchor_id,
                render_anchor_source_id=render_anchor_source_id,
            )
            if scene_id
            else None
        )
    return None


def build_scene_ref(
    scene_id: str = "",
    variant_id: str = "",
) -> SceneRef | None:
    scene_id = (scene_id or "").strip()
    variant_id = (variant_id or "").strip()
    return SceneRef(scene_id=scene_id, variant_id=variant_id) if scene_id else None


def beat_scene_ref(value: Any) -> SceneRef | None:
    if isinstance(value, dict):
        scene_ref = _coerce_scene_ref(value.get("scene_ref"))
        if scene_ref:
            return scene_ref
        return build_scene_ref(
            str(value.get("scene_id", "") or ""),
            str(value.get("scene_variant_id", "") or ""),
        )
    scene_ref = _coerce_scene_ref(getattr(value, "scene_ref", None))
    if scene_ref:
        return scene_ref
    return build_scene_ref(
        str(getattr(value, "scene_id", "") or ""),
        str(getattr(value, "scene_variant_id", "") or ""),
    )


def beat_scene_id(value: Any) -> str:
    scene_ref = beat_scene_ref(value)
    return scene_ref.scene_id if scene_ref else ""


def sync_beat_asset_refs(beat: dict[str, Any]) -> dict[str, Any]:
    """规范化 beat 中的场景引用字段。

    规范结构：
    - scene_ref.scene_id: 场景 ID
    - scene_ref.render_anchor_id: Beat 实际 render 背景槽位；空或 selected_background
    - scene_ref.render_anchor_source_id: selected_background 的来源，仅用于 UI 显示/追踪
    """

    scene_ref = _coerce_scene_ref(beat.get("scene_ref"))
    if not scene_ref:
        scene_ref = build_scene_ref(str(beat.get("scene_id", "") or ""))
    beat["scene_ref"] = scene_ref.model_dump() if scene_ref else None
    beat.pop("scene_id", None)

    return beat


class NovelVisualBeat(BaseModel):
    """视觉节拍实体。"""

    beat_number: int = Field(..., description="节拍序号（1-based）")
    episode_number: int = Field(..., description="所属集数")
    narration: str = Field(default="", description="TTS 文本（旁白或台词，用于嵌入索引）")
    visual_description: str = Field(default="", description="画面描述（创意意图）")

    time_of_day: str = Field(
        default="",
        description="时间段（清晨/上午/正午/午后/白天/黄昏/夜晚）；为空表示不指定",
    )

    # 草图颜色检测
    detected_identities_json: str = Field(
        default="[]", description="草图颜色检测到的出场身份ID列表（JSON 序列化）"
    )
    detected_props_json: str = Field(
        default="[]", description="草图颜色检测到的出场全局道具ID列表（JSON 序列化）"
    )
    scene_ref_json: str = Field(
        default="",
        description="当前 beat 的规范化场景引用 JSON",
    )
    # 视频生成参数（Beat 层）
    video_mode: str = Field(default="first_frame", description="first_frame / keyframe")
    video_prompt: str = Field(default="", description="视频运动提示词")
    keyframe_prompt: str = Field(default="", description="首尾帧过渡提示词")

    # Seedance 2.0 per-beat config overrides (Stage B; Stage A persists '{}' default)
    seedance2_config_json: str = Field(
        default="{}",
        description="Seedance 2.0 per-beat 覆写 JSON（Stage B 真正使用，Stage A 仅落库占位）",
    )

    # 对话支持
    audio_type: str = Field(default="narration", description="silence/narration/dialogue")
    speaker: str = Field(default="", description="说话人标签")
    speaker_kind: str = Field(
        default="character",
        description="speaker 类型：character/non_character",
    )

    # 手工分镜插入支持
    shot_order: Optional[int] = Field(
        default=None, description="显示/叙事顺序（fractional ordering）"
    )
    duration_seconds: Optional[float] = Field(default=None, description="用户指定目标时长（秒）")
    is_manual_shot: bool = Field(default=False, description="是否为用户手工插入的分镜")

    @model_validator(mode="after")
    def ensure_fields_not_empty(self) -> "NovelVisualBeat":
        """确保关键字段不为空。"""
        scene_ref = None
        if self.scene_ref_json:
            try:
                scene_ref = _coerce_scene_ref(json.loads(self.scene_ref_json))
            except (TypeError, ValueError, json.JSONDecodeError):
                scene_ref = None
        self.scene_ref_json = (
            json.dumps(scene_ref.model_dump(), ensure_ascii=False) if scene_ref else ""
        )

        if not self.narration or not self.narration.strip():
            if not self.is_manual_shot and self.audio_type not in {"silence", "action"}:
                self.narration = "(empty)"
        if not self.visual_description or not self.visual_description.strip():
            if not self.is_manual_shot:
                self.visual_description = f"场景画面：{self.narration[:50]}"
        return self

    @property
    def scene_ref(self) -> SceneRef | None:
        if not self.scene_ref_json:
            return None
        try:
            return _coerce_scene_ref(json.loads(self.scene_ref_json))
        except (TypeError, ValueError, json.JSONDecodeError):
            return None

    @property
    def scene_id(self) -> str:
        scene_ref = self.scene_ref
        return scene_ref.scene_id if scene_ref else ""


__all__ = [
    "NovelVisualBeat",
    "SceneRef",
    "beat_scene_id",
    "beat_scene_ref",
    "build_scene_ref",
    "sync_beat_asset_refs",
]

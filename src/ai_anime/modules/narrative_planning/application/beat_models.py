"""Persisted beat models owned by Narrative Planning."""

import json
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from ai_anime.models import SceneRef, _coerce_scene_ref


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


__all__ = ["NovelVisualBeat"]

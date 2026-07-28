"""Script models owned by Narrative Planning."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from ai_anime.modules.narrative_planning.application.beat_models import (
    SceneRef,
    beat_scene_ref,
    build_scene_ref,
)


class NarrationScript(BaseModel):
    """解说脚本 - 扁平化结构。

    beats 是核心单位（扁平列表），shots 是轻量分组（分镜宫格，用于视频生成规划）。
    """

    episode_number: int
    title: str = ""

    # 核心：扁平 beats 列表
    beats: list["VisualBeat"] = Field(default_factory=list, description="视觉节拍列表")

    # 元数据
    total_duration_seconds: float = Field(default=120.0, description="预估总时长（秒）")
    created_at: datetime = Field(default_factory=datetime.now)

    def get_total_duration(self) -> float:
        """获取所有 beats 的总时长。"""
        return sum(b.estimated_duration for b in self.beats)


class VisualBeat(BaseModel):
    """视觉节拍 - 解说词的一个片段及对应的画面。

    每个 VisualBeat 代表一句解说词 + 对应的画面描述，
    实现画面和解说词的精确同步。

    时长约束（小说旁白风格）：
    - 每个 beat 的字数由节奏预设（rhythm）决定（对应 4-6 秒 TTS 时长）
    - 即梦API固定生成5秒视频，会根据实际TTS时长裁剪/拼接
    - 风格要求：像讲故事一样娓娓道来，禁止使用语气词
    """

    beat_number: int = Field(description="节拍序号（从1开始）")
    narration_segment: str = Field(description="这段解说词（中文）")
    visual_description: str = Field(description="对应画面描述（中文，创意意图描述）")

    time_of_day: str = Field(
        default="",
        description="时间段（清晨/上午/正午/午后/白天/黄昏/夜晚）；独立时间条件，不拼进 scene 名称",
    )
    scene_ref: Optional[SceneRef] = Field(
        default=None,
        description="规范化场景引用；新流程主要使用 scene_id",
    )
    # 对话支持
    audio_type: str = Field(
        default="narration",
        description="silence=无朗读画面 beat / narration=旁白解说 / dialogue=角色台词",
    )
    speaker: str = Field(
        default="", description="说话人标签（主角色可用 identity_id，群众/路人可用普通标签）"
    )
    speaker_kind: str = Field(
        default="character",
        description="speaker 类型：character=物理角色或普通角色，non_character=广播/画外音/字幕/屏幕文字等非角色发声源",
    )

    # 时长信息（生成时按字数估算，不持久化到 DB）
    estimated_duration: float = Field(default=0.0, description="预估时长（秒），按字数计算")

    # 手工分镜插入支持
    shot_order: Optional[int] = Field(
        default=None, description="显示/叙事顺序（fractional ordering）"
    )
    duration_seconds: Optional[float] = Field(default=None, description="用户指定目标时长（秒）")
    is_manual_shot: bool = Field(default=False, description="是否为用户手工插入的分镜")

    # ==========================================================================
    # 资产生成状态（Phase 5 新增）
    # ==========================================================================

    # 首帧选图 ID
    frame_pool_id: Optional[str] = Field(
        default=None,
        description="选中的池图片 ID，格式: {mode}_{grid_idx:02d}_{cell_idx:02d}，如 '3x3_01_05'",
    )

    # 视频历史版本
    video_versions: list[str] = Field(default_factory=list, description="历史版本路径列表")

    # 视频池条目 ID
    video_pool_id: Optional[str] = Field(default=None, description="选中的视频池条目 ID")

    # 视频生成模式（与持久化层 NovelVisualBeat / DB beats.video_mode 对齐）
    video_mode: str = Field(
        default="first_frame",
        description=(
            "视频生成模式："
            "first_frame=普通 I2V（只需首帧）"
            " | keyframe=首尾帧过渡"
            "（未来可加 text_to_video / extend / loop 等）"
        ),
    )

    # 视频提示词（First Frame 模式使用）
    video_prompt: Optional[str] = Field(
        default=None,
        description="视频运动提示词（描述视频中的动作和运动）",
    )

    # 首尾帧过渡提示词（Keyframe 模式使用）
    keyframe_prompt: Optional[str] = Field(
        default=None,
        description="首尾帧过渡提示词（描述首尾帧之间的变化过程）",
    )
    # 注：尾帧路径不需要存储，动态获取下一个 beat 的 frame_path

    # ==========================================================================
    # Action Beat 专属字段（2.0 短剧模式）
    # ==========================================================================

    action_description: str = Field(
        default="",
        description="原始动作描述（action beat 专用，方便 UI 展示和重新生成草图）",
    )
    # action 网格/面板路径 + 选中状态均由 PathResolver 按约定计算，不存储

    @model_validator(mode="after")
    def sync_asset_refs(self) -> "VisualBeat":
        self.scene_ref = beat_scene_ref(self)
        return self

    @property
    def scene_id(self) -> str:
        return self.scene_ref.scene_id if self.scene_ref else ""

    @scene_id.setter
    def scene_id(self, value: str):
        self.scene_ref = build_scene_ref(value)


def format_beat_narration(audio_type: str, speaker: str, narration: str) -> str:
    """统一格式化 beat 的 narration 显示文本。

    dialogue beat → 【台词·{speaker}】{narration}
    narration beat → {narration}
    silence/action beat → ""
    """
    if audio_type in {"silence", "action"}:
        return ""
    if audio_type == "dialogue" and narration:
        if speaker:
            return f"【台词·{speaker}】{narration}"
        return f"【台词】{narration}"
    return narration


__all__ = ["NarrationScript", "VisualBeat", "format_beat_narration"]

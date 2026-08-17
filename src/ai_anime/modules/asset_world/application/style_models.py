"""Style models owned by the Asset & World application layer."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class StyleConfig(BaseModel):
    """风格配置模型 - One Source of Truth for style settings.

    支持系统预设（应用文件）和账号级自定义风格（用户目录）。

    字段说明：
    - style_instructions / avoid_instructions: 所有图像模型共用的项目风格指令
    - style_tag: Render 模式注入每个 panel 的短标签
    """

    id: str = Field(description="风格唯一标识，如 'chinese_period_drama'")
    name: str = Field(description="显示名称，如 '写实古装剧'")
    base: Optional[str] = Field(
        default=None,
        description="继承自哪个预设风格（可选，用于自定义风格继承）",
    )

    style_instructions: str = Field(
        default="",
        description="通用风格指令，如 'Create a cinematic scene...'",
    )
    avoid_instructions: str = Field(
        default="",
        description="通用避免指令，如 'Do not create anime style...'",
    )
    style_tag: str = Field(
        default="",
        description="per-panel 短标签，如 'PHOTOREALISTIC LIVE-ACTION'，用于 Render 模式注入每个 Panel",
    )

    # 通用字段
    label: str = Field(
        default="",
        description="UI 显示标签，如 '写实古装剧'",
    )
    style_family: str = Field(
        default="live_action",
        description="风格大类：live_action | animation",
    )
    animation_subtype: str = Field(
        default="",
        description="动画子类：2d | 3d | hybrid；真人风格为空",
    )

    # 元数据
    is_preset: bool = Field(
        default=False,
        description="是否为系统预设（True=不可删除，False=自定义风格）",
    )
    created_at: Optional[datetime] = Field(default=None, description="创建时间（仅自定义风格）")
    created_by: Optional[str] = Field(default=None, description="创建者（仅自定义风格）")
    preview_path: Optional[str] = Field(
        default=None,
        description="自定义风格参考图相对于账号资源目录的路径；预设风格为空",
    )

    def to_legacy_dict(self) -> dict:
        """Return the runtime style dict used by all generation paths."""
        result = {
            "style_instructions": self.style_instructions,
            "avoid_instructions": self.avoid_instructions,
            "style_family": self.style_family,
            "animation_subtype": self.animation_subtype,
            "label": self.label or self.name,
        }
        if self.style_tag:
            result["style_tag"] = self.style_tag
        return result

    @classmethod
    def from_legacy_dict(cls, style_id: str, data: dict, name: str = "") -> "StyleConfig":
        """从旧版 STYLE_PRESETS 格式创建 StyleConfig。

        Args:
            style_id: 风格 ID
            data: 旧版配置字典
            name: 显示名称

        Returns:
            StyleConfig 实例
        """
        return cls(
            id=style_id,
            name=name or style_id,
            style_instructions=data.get("style_instructions", ""),
            avoid_instructions=data.get("avoid_instructions", ""),
            style_tag=data.get("style_tag", ""),
            label=data.get("label", name or style_id),
            style_family=data.get("style_family", "live_action"),
            animation_subtype=data.get("animation_subtype", ""),
            is_preset=True,
        )


__all__ = ["StyleConfig"]

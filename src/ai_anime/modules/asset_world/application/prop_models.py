"""Prop models owned by the Asset & World application layer."""

from pydantic import BaseModel, Field, model_validator

from ai_anime.modules.asset_world.domain.asset_names import (
    coerce_path_safe_asset_name,
)


class NovelProp(BaseModel):
    """道具实体 — 故事中的重要物件/武器/信物。"""

    name: str = Field(description="道具名称，如 '七星剑'")
    aliases: list[str] = Field(default_factory=list, description="别名")
    prop_type: str = Field(
        default="object", description="weapon/accessory/artifact/document/furniture"
    )
    visual_prompt: str = Field(default="", description="道具视觉 prompt（用于生成参考图）")
    description: str = Field(default="", description="道具叙述性描述（材质、尺寸、用途）")
    owner: str = Field(default="", description="所属角色名")
    notes: str = Field(default="")
    updated_at: str = Field(default="", description="道具资产最后一次内容变化时间 ISO 字符串")

    @model_validator(mode="after")
    def sanitize_name(self):
        self.name, self.aliases = coerce_path_safe_asset_name(
            self.name,
            self.aliases,
        )
        return self


__all__ = ["NovelProp"]

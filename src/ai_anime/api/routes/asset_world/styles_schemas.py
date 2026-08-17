"""Inbound schemas for style endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class StyleConfigRequest(BaseModel):
    """Canonical writable fields for one visual style."""

    model_config = ConfigDict(extra="forbid")

    base: str | None = None
    style_instructions: str = ""
    avoid_instructions: str = ""
    style_tag: str = ""
    label: str = ""
    style_family: Literal["live_action", "animation"] = "live_action"
    animation_subtype: Literal["", "2d", "3d", "hybrid"] = ""


class CreateStyleRequest(BaseModel):
    """创建自定义风格。省略 ``id`` 时由应用层生成。"""

    id: str | None = None
    name: str | None = None
    config: StyleConfigRequest = Field(default_factory=StyleConfigRequest)
    preview_path: str | None = None


class UpdateStyleRequest(BaseModel):
    """完整更新一个已存在的自定义风格。"""

    name: str = Field(min_length=1)
    config: StyleConfigRequest


class StylePreviewRequest(BaseModel):
    project: Optional[str] = None
    prompt: str = (
        "An unoccupied cinematic environment with architecture, foliage, "
        "fabric, wood, metal, and glass"
    )


__all__ = [
    "CreateStyleRequest",
    "StyleConfigRequest",
    "StylePreviewRequest",
    "UpdateStyleRequest",
]

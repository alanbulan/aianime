"""Inbound schemas for Creative Canvas media endpoints."""

from typing import Optional

from pydantic import BaseModel, Field


class FreezoneThreeDViewerScreenshotRequest(BaseModel):
    """保存 Freezone 内置 3D viewer 的普通截图。"""

    data_url: str = Field(description="canvas.toDataURL('image/png') 得到的 data URL")
    node_id: Optional[str] = Field(default=None, description="来源 3D 世界节点 id")
    label: Optional[str] = Field(default=None, description="可选显示名")


__all__ = ["FreezoneThreeDViewerScreenshotRequest"]

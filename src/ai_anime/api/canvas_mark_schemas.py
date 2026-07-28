"""Shared mark schema for Creative Canvas image and video endpoints."""

from typing import Optional

from pydantic import BaseModel, Field


class FreezoneVideoMark(BaseModel):
    """视频节点局部元素标记。"""

    label: str = Field(description="标记出的元素名称，例如 老人 / 氧气管 / 病床")
    source_url: str = Field(default="", description="标记来源图片静态地址，可为空")
    point_x: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="点击点的归一化横坐标，范围 0-1",
    )
    point_y: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="点击点的归一化纵坐标，范围 0-1",
    )
    box_x: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="局部框左上角归一化横坐标，范围 0-1",
    )
    box_y: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="局部框左上角归一化纵坐标，范围 0-1",
    )
    box_width: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="局部框归一化宽度，范围 0-1",
    )
    box_height: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="局部框归一化高度，范围 0-1",
    )
    note: str = Field(default="", description="前端补充说明，可为空")


__all__ = ["FreezoneVideoMark"]

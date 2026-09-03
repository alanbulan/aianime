"""Inbound schemas for Creative Canvas mainline skill endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class FreezoneSketchFromContextRequest(BaseModel):
    episode: int
    beat: int
    aspect_ratio: Literal["2:3", "16:9"] = "2:3"
    source_kind: Literal[
        "beat",
        "selected_background",
        "director_combined",
        "background_candidate",
    ] = "beat"
    source_url: Optional[str] = None
    canvas_id: str = Field(default="")
    node_id: str = Field(default="")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Literal["low", "medium", "high"] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


class FreezoneFrameFromContextRequest(BaseModel):
    episode: int
    beat: int
    aspect_ratio: Literal["2:3", "16:9"] = "2:3"
    sketch_url: str
    background_url: Optional[str] = None
    identity_urls: list[str] = Field(default_factory=list)
    prop_urls: list[str] = Field(default_factory=list)
    canvas_id: str = Field(default="")
    node_id: str = Field(default="")
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    quality: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="图片画质档位，默认 medium",
    )


class FreezoneScene360Request(BaseModel):
    """场景 360 全景生成请求。

    约定只接收一张场景源图 `master.png` 作为参考输入。
    """

    reference_url: str = Field(
        description="场景源图静态地址，通常指向 assets/scenes/<scene_id>/master.png"
    )
    reverse_reference_url: Optional[str] = Field(
        default=None,
        description=(
            "可选反向场景源图静态地址，通常指向 assets/scenes/<scene_id>/reverse.png"
        ),
    )
    canvas_id: str = Field(default="")
    node_id: str = Field(default="")
    image_size: Literal["1K", "2K", "4K"] = Field(
        default="2K", description="输出分辨率档位，默认 2K"
    )
    mode: Literal["candidate", "commit"] = Field(
        default="candidate",
        description="candidate 只生成画布候选；commit 明确写回主线 360 slot",
    )
    model: str = Field(
        min_length=1,
        description="登录后 IMAGE 模型目录返回的平台 SKU",
    )
    model_id: Optional[str] = Field(default=None, description="本地统一代理路由选择器")
    quality: Literal["low", "medium", "high"] = Field(
        default="medium", description="图片画质档位，默认 medium"
    )


__all__ = [
    "FreezoneFrameFromContextRequest",
    "FreezoneScene360Request",
    "FreezoneSketchFromContextRequest",
]

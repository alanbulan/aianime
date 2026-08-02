"""Inbound schemas for Creative Canvas text endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class FreezoneTextTranslateRequest(BaseModel):
    """Freezone 文本工具：中英文互译请求。"""

    text: str = Field(description="待翻译的原始文本或提示词")
    model: str = Field(
        min_length=1,
        max_length=256,
        description="登录后 TEXT 模型目录返回的平台 SKU",
    )
    node_type: Literal["generic", "image", "video", "audio", "text"] = Field(
        default="generic",
        description="使用场景。用于帮助翻译器按节点类型保留合适的提示词语气",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )


class FreezoneStoryScriptGenerateRequest(BaseModel):
    """Freezone 文本节点：故事脚本生成请求。"""

    source_text: str = Field(
        default="",
        description="已上传剧本的文本内容。与 source_url 至少提供一个",
    )
    source_url: Optional[str] = Field(
        default=None,
        description="已上传剧本文本文件的静态 URL。与 source_text 至少提供一个",
    )
    prompt: str = Field(
        default="根据我上传的剧本生成一个完整的故事脚本",
        description="用户补充要求，会和源剧本内容一起交给模型",
    )
    model: str = Field(
        min_length=1,
        max_length=256,
        description="登录后 TEXT 模型目录返回的平台 SKU",
    )
    canvas_id: str = Field(
        default="", description="可选：来源画布 id，用于记录节点生成历史"
    )
    node_id: str = Field(
        default="", description="可选：来源节点 id，用于记录节点生成历史"
    )


__all__ = ["FreezoneStoryScriptGenerateRequest", "FreezoneTextTranslateRequest"]

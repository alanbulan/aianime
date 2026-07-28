"""Episode planning models owned by Narrative Planning."""

from typing import List

from pydantic import BaseModel, Field


class NovelEvent(BaseModel):
    """小说事件（场景级）。"""

    event_id: str = Field(..., description="唯一ID，如 ch1_e1")
    chapter_num: int = Field(..., description="所属章节")
    description: str = Field(..., description="事件描述（20字以内）")
    location: str = Field(default="", description="地点")
    time_marker: str = Field(default="", description="时间标记（如：傍晚、第二天）")
    characters: List[str] = Field(default_factory=list, description="参与角色")
    text_start: int = Field(default=0, description="原文起始位置（字符偏移）")
    text_end: int = Field(default=0, description="原文结束位置")
    content: str = Field(default="", description="事件对应的原文")
    causes: List[str] = Field(default_factory=list, description="因果关系（前置事件ID）")


__all__ = ["NovelEvent"]

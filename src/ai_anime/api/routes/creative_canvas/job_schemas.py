"""Shared response schemas for accepted Creative Canvas jobs."""

from typing import Literal

from pydantic import BaseModel, Field


class FreezoneJobAcceptedData(BaseModel):
    task_type: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    task_key: str = Field(min_length=1)
    task_id: str | None = None
    task_episode: int | None = None
    task_scope: str | None = None
    task_beat_num: int | None = None
    backend: str | None = None
    queue: str | None = None


class FreezoneJobAcceptedResponse(BaseModel):
    ok: Literal[True] = True
    data: FreezoneJobAcceptedData


__all__ = ["FreezoneJobAcceptedData", "FreezoneJobAcceptedResponse"]

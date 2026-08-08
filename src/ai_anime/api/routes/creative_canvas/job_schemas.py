"""Shared response schemas for accepted Creative Canvas jobs."""

from typing import Literal

from pydantic import BaseModel


class FreezoneJobAcceptedData(BaseModel):
    task_type: str
    job_id: str
    task_key: str


class FreezoneJobAcceptedResponse(BaseModel):
    ok: Literal[True] = True
    data: FreezoneJobAcceptedData


__all__ = ["FreezoneJobAcceptedData", "FreezoneJobAcceptedResponse"]

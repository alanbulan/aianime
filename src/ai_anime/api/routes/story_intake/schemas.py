"""HTTP request schemas for Story Intake endpoints."""

from typing import Literal

from pydantic import BaseModel


class IngestStart(BaseModel):
    filename: str
    rebuild: bool = False
    spine_template: Literal["drama", "narrated"] | None = None

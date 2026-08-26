"""HTTP request schemas for Story Intake endpoints."""

from typing import Literal

from pydantic import BaseModel


class IngestStart(BaseModel):
    filename: str
    rebuild: bool = False
    spine_template: Literal["drama", "narrated"] | None = None
    visual_style: str | None = None
    narration_style: Literal["first_person", "third_person"] | None = None
    ethnicity: Literal["Chinese", "Japanese", "Korean", "Western"] | None = None

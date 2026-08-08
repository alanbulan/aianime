"""HTTP request schemas for Story Intake endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class IngestStart(BaseModel):
    filename: str
    text_model: str = Field(alias="textModel", min_length=1, max_length=256)
    embedding_model: str = Field(
        alias="embeddingModel",
        min_length=1,
        max_length=256,
    )
    rebuild: bool = False
    spine_template: Literal["drama", "narrated"] | None = None

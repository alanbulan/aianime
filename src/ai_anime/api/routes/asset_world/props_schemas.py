"""Inbound schemas for prop asset endpoints."""

from typing import Optional

from pydantic import BaseModel, Field


class PropCreate(BaseModel):
    name: str
    aliases: list[str] = Field(default_factory=list)
    prop_type: str = "object"
    visual_prompt: str = ""
    description: str = ""
    owner: str = ""
    notes: str = ""


class PropUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    prop_type: Optional[str] = None
    visual_prompt: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None


class PropReferenceGenerateRequest(BaseModel):
    style: Optional[str] = None
    model: Optional[str] = None


__all__ = ["PropCreate", "PropReferenceGenerateRequest", "PropUpdate"]

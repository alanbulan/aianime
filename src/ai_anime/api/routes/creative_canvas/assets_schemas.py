"""Inbound schemas for Creative Canvas asset endpoints."""

from pydantic import BaseModel


class CreateIdentityAssetRequest(BaseModel):
    source_url: str
    character: str
    identity_name: str
    appearance_details: str = ""
    face_prompt: str = ""
    age_group: str = ""


__all__ = ["CreateIdentityAssetRequest"]

"""Inbound schemas for character and identity endpoints."""

from typing import Literal, Optional

from pydantic import BaseModel


class PortraitGenRequest(BaseModel):
    style: Optional[str] = None
    ethnicity: str = "Chinese"
    model: Optional[str] = None


class CharacterCreate(BaseModel):
    name: str
    role: str = ""
    is_main: bool = False
    gender: str = ""
    age_group: str = "youth"
    description: str = ""
    face_prompt: str = ""


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    face_prompt: Optional[str] = None
    description: Optional[str] = None
    gender: Optional[str] = None
    age_group: Optional[str] = None
    is_main: Optional[bool] = None
    role: Optional[str] = None  # "主角" / "配角" / "反派"
    body_type: Optional[str] = None  # "纤细高挑" / "健壮魁梧" 等
    aliases: Optional[list[str]] = None


class IdentityCreate(BaseModel):
    identity_name: str
    age_group: str = ""
    appearance_details: str = ""


class IdentityImageGenRequest(BaseModel):
    style: Optional[str] = None
    model: Optional[str] = None


CharacterAssetKind = Literal[
    "portrait", "identity", "identity_costume", "identity_portrait"
]


class CharacterAssetRestoreRequest(BaseModel):
    kind: CharacterAssetKind
    history_id: str
    identity_id: Optional[str] = None


class CharacterImageSelectionRequest(BaseModel):
    character_image_selection: str


class AssetImageSourceSelectionRequest(BaseModel):
    image_source_selection: str


class IdentityUpdate(BaseModel):
    identity_name: Optional[str] = None
    appearance_details: Optional[str] = None
    face_prompt: Optional[str] = None
    age_group: Optional[str] = None
    body_type: Optional[str] = None


__all__ = [
    "AssetImageSourceSelectionRequest",
    "CharacterAssetKind",
    "CharacterAssetRestoreRequest",
    "CharacterCreate",
    "CharacterImageSelectionRequest",
    "CharacterUpdate",
    "IdentityCreate",
    "IdentityImageGenRequest",
    "IdentityUpdate",
    "PortraitGenRequest",
]

"""Inbound schemas for Creative Canvas document endpoints."""

from typing import Literal, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator

CANVAS_MAX_NODES = 50_000
CANVAS_MAX_EDGES = 200_000


class CanvasPayload(BaseModel):
    schema_version: Optional[Literal[2]] = None
    canvas_id: Optional[str] = None
    project_id: Optional[str] = None
    canvas_scope: Optional[Literal["default", "episode", "beat", "asset"]] = None
    owner_principal_type: Optional[Literal["user", "team"]] = None
    owner_principal_id: Optional[str] = None
    access_model: Optional[Literal["project_role"]] = None
    min_project_role: Optional[Literal["viewer", "editor", "admin"]] = None
    episode: Optional[int] = None
    beat: Optional[int] = None
    asset_target: Optional[dict] = None
    revision: Optional[int] = None
    base_revision: Optional[int] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    client_save_id: Optional[str] = None
    save_source: Literal[
        "autosave",
        "manual_save",
        "manual_clear",
        "restore",
        "from_preset",
        "projection_remove",
        "import",
    ] = "autosave"
    allow_empty_overwrite: bool = False
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    viewport: Optional[dict] = None
    metadata: Optional[dict] = None

    @model_validator(mode="after")
    def _check_payload_size(self) -> "CanvasPayload":
        # Raise HTTPException directly so the response carries a stable,
        # machine-readable code instead of Pydantic's default
        # "List should have at most N items" message (which echoes the
        # entire offending list and is unparseable client-side).
        if len(self.nodes) > CANVAS_MAX_NODES:
            raise HTTPException(
                422,
                {
                    "code": "canvas_payload_too_large",
                    "field": "nodes",
                    "limit": CANVAS_MAX_NODES,
                    "got": len(self.nodes),
                },
            )
        if len(self.edges) > CANVAS_MAX_EDGES:
            raise HTTPException(
                422,
                {
                    "code": "canvas_payload_too_large",
                    "field": "edges",
                    "limit": CANVAS_MAX_EDGES,
                    "got": len(self.edges),
                },
            )
        return self


__all__ = ["CanvasPayload"]

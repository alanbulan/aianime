"""Commands and results owned by Asset & World style use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True)
class StyleScope:
    username: str
    project_name: str | None = None
    project_dir: Path | None = None
    request_project: str | None = None


@dataclass(frozen=True)
class CreateCustomStyleCommand:
    style_id: str
    name: str | None
    config: Mapping[str, Any] | None
    preview_path: str | None = None


@dataclass(frozen=True)
class StyleFile:
    path: Path
    media_type: str
    filename: str | None = None


@dataclass(frozen=True)
class StyleAnalysisBilling:
    billing_user_id: str
    project_id: str
    requester_user_id: str
    project_owner_id: str

    @classmethod
    def from_project_context(cls, context: Any) -> "StyleAnalysisBilling":
        requester_user_id = str(
            getattr(context, "requester_user_id", "") or ""
        ).strip()
        project_owner_id = str(getattr(context, "owner_id", "") or "").strip()
        return cls(
            billing_user_id=requester_user_id or project_owner_id,
            project_id=str(getattr(context, "project_id", "") or ""),
            requester_user_id=requester_user_id,
            project_owner_id=project_owner_id,
        )


@dataclass(frozen=True)
class AnalyzeStyleCommand:
    content: bytes
    mime_type: str
    filename: str | None
    style_id: str = ""
    billing: StyleAnalysisBilling | None = None

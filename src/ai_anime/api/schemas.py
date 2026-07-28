"""API 请求/响应 Pydantic 模型。"""

from typing import Literal, Optional

from pydantic import BaseModel

from ai_anime.api.story_intake_schemas import IngestStart as IngestStart

ProjectStatus = Literal["active", "archived", "deleted"]


# ── 通用响应 ──────────────────────────────────────────────────────────────────


class TaskResponse(BaseModel):
    ok: bool = True
    task_id: str = ""
    task_type: str = ""
    message: str = ""


class ErrorResponse(BaseModel):
    ok: bool = False
    error: str = ""


# ── 项目 ──────────────────────────────────────────────────────────────────────


class ProjectGrantCreate(BaseModel):
    principal_type: Literal["user", "team"] = "user"
    principal_id: Optional[str] = None
    principal_username: Optional[str] = None
    role: Literal["viewer", "editor", "admin"]


class ProjectGrantUpdate(BaseModel):
    role: Literal["viewer", "editor", "admin"]


class ProjectGrantSummary(BaseModel):
    id: str
    project_id: str
    principal_type: str
    principal_id: str
    principal_username: Optional[str] = None
    role: str
    created_at: Optional[str] = None


# ── 风格 ──────────────────────────────────────────────────────────────────────


class StyleCreateRequest(BaseModel):
    id: str
    name: str
    label: str
    config: dict

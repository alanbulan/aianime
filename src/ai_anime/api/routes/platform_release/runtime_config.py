"""Public runtime configuration for the frontend."""

from __future__ import annotations

from dataclasses import asdict
import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ai_anime.modules.platform_release.public import runtime_config_queries

router = APIRouter()

_PROJECT_SHARING_OPERATIONS = {
    ("get", "/api/v1/projects/{}/grants"),
    ("post", "/api/v1/projects/{}/grants"),
    ("patch", "/api/v1/projects/{}/grants/{}"),
    ("delete", "/api/v1/projects/{}/grants/{}"),
    ("get", "/api/v1/users/search"),
}


@router.get("/config")
async def get_runtime_config(request: Request):
    data = asdict(runtime_config_queries().current())
    data["project_sharing_enabled"] = False
    if data["edition"] == "ee":
        operations = {
            (method, re.sub(r"\{[^}]+\}", "{}", path))
            for path, methods in request.app.openapi()["paths"].items()
            for method in methods
        }
        data["project_sharing_enabled"] = _PROJECT_SHARING_OPERATIONS <= operations
    return JSONResponse(
        {
            "ok": True,
            "data": data,
        }
    )

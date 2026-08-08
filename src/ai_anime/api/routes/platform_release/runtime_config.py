"""Public runtime configuration for the frontend."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ai_anime.modules.platform_release.public import runtime_config_queries

router = APIRouter()


@router.get("/config")
async def get_runtime_config():
    return JSONResponse(
        {
            "ok": True,
            "data": asdict(runtime_config_queries().current()),
        }
    )

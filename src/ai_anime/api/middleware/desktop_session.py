"""Desktop sidecar session boundary."""

from __future__ import annotations

import secrets

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def install_desktop_session_middleware(
    application: FastAPI,
    *,
    desktop_mode: bool,
    desktop_token: str,
) -> None:
    if not desktop_mode:
        return

    @application.middleware("http")
    async def _require_desktop_token(request: Request, call_next):
        supplied = request.headers.get("X-AI-Anime-Desktop-Token", "")
        if not secrets.compare_digest(supplied, desktop_token):
            return JSONResponse(
                status_code=401,
                content={"ok": False, "error": "desktop session rejected"},
            )
        return await call_next(request)

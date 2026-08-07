"""Standalone ASGI application factory for the REST API."""

from __future__ import annotations

import os

from fastapi import FastAPI

from ai_anime.api.errors import register_exception_handlers
from ai_anime.api.lifespan import app_lifespan
from ai_anime.api.logging_config import configure_api_logging
from ai_anime.api.middleware import install_http_middleware
from ai_anime.api.platform_routes import (
    mount_frontend,
    register_runtime_routes,
    register_static_media_routes,
)
from ai_anime.api.v1.router import OPENAPI_TAGS, create_api_router
from ai_anime.shared.api_coverage import mount_api_coverage_middleware


_app: FastAPI | None = None


def create_app() -> FastAPI:
    configure_api_logging()

    application = FastAPI(
        title="AI anime API",
        openapi_tags=OPENAPI_TAGS,
        lifespan=app_lifespan,
    )
    mount_api_coverage_middleware(application)

    desktop_mode = os.environ.get("AI_ANIME_DESKTOP_MODE", "") == "1"
    desktop_token = os.environ.get("AI_ANIME_DESKTOP_TOKEN", "").strip()
    if desktop_mode and not desktop_token:
        raise RuntimeError("AI_ANIME_DESKTOP_TOKEN is required in desktop mode")

    install_http_middleware(
        application,
        desktop_mode=desktop_mode,
        desktop_token=desktop_token,
    )
    register_exception_handlers(application)
    register_runtime_routes(application, desktop_mode=desktop_mode)

    application.include_router(create_api_router(desktop_mode=desktop_mode))
    register_static_media_routes(application)
    mount_frontend(
        application,
        os.environ.get("AI_ANIME_FRONTEND_DIST", "").strip(),
    )
    return application


def __getattr__(name: str):
    if name == "app":
        global _app
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(name)

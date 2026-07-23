"""HTTP middleware assembly."""

from __future__ import annotations

from fastapi import FastAPI

from ai_anime.api.middleware.desktop_session import (
    install_desktop_session_middleware,
)
from ai_anime.api.middleware.request_limits import install_request_limit_middleware
from ai_anime.api.middleware.resource_logging import (
    install_resource_logging_middleware,
)


def install_http_middleware(
    application: FastAPI,
    *,
    desktop_mode: bool,
    desktop_token: str,
) -> None:
    # Keep registration order stable: Starlette executes the last registered
    # function middleware first.
    install_desktop_session_middleware(
        application,
        desktop_mode=desktop_mode,
        desktop_token=desktop_token,
    )
    install_request_limit_middleware(application)
    install_resource_logging_middleware(application)

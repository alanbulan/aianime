"""Canonical runtime configuration for chat backends."""

from __future__ import annotations

import os

DEFAULT_API_HOST = "127.0.0.1"
DEFAULT_API_PORT = "8780"


def load_api_url() -> str:
    explicit = os.environ.get("AI_ANIME_API_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    host = (
        os.environ.get("AI_ANIME_API_HOST", DEFAULT_API_HOST).strip()
        or DEFAULT_API_HOST
    )
    if host in {"0.0.0.0", "::"}:
        host = DEFAULT_API_HOST
    port = (
        os.environ.get("AI_ANIME_API_PORT", DEFAULT_API_PORT).strip()
        or DEFAULT_API_PORT
    )
    return f"http://{host}:{port}"

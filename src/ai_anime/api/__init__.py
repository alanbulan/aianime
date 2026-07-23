"""AI anime Studio REST API package.

Route assembly lives in :mod:`ai_anime.api.v1.router`.  The lazy exports keep
the legacy ``from ai_anime.api import api_router`` contract without importing
every route as a side effect of importing this package.
"""

from __future__ import annotations

from typing import Any

__all__ = ["OPENAPI_TAGS", "api_router", "register_verification_routes"]

_ROUTER_EXPORTS = frozenset(__all__)


def __getattr__(name: str) -> Any:
    if name in _ROUTER_EXPORTS:
        from ai_anime.api.v1 import router as router_module

        return getattr(router_module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

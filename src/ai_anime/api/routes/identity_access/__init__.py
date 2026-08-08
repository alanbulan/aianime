"""Identity Access HTTP adapters."""

from fastapi import APIRouter


def create_router(*, desktop_mode: bool) -> APIRouter:
    from . import auth

    router = APIRouter()
    router.include_router(auth.router, tags=["auth"])
    if desktop_mode:
        router.include_router(auth.desktop_router, tags=["auth"])
    return router


__all__ = ["create_router"]

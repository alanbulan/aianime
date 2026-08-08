"""Platform Release HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import runtime_config

    router = APIRouter()
    router.include_router(runtime_config.router, tags=["config"])
    return router


__all__ = ["create_router"]

"""Model Usage HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import gateway

    router = APIRouter()
    router.include_router(gateway.router, tags=["model-gateway"])
    return router


__all__ = ["create_router"]

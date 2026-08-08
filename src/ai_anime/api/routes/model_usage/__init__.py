"""Model Usage HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import credits, gateway

    router = APIRouter()
    router.include_router(gateway.router, tags=["model-gateway"])
    router.include_router(credits.router, tags=["model-credits"])
    return router


__all__ = ["create_router"]

"""Story Intake HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import ingest

    router = APIRouter()
    router.include_router(ingest.router, tags=["ingest"])
    return router


__all__ = ["create_router"]

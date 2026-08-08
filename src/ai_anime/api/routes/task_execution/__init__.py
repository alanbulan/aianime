"""Task Execution HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import pipeline, tasks

    router = APIRouter()
    router.include_router(tasks.router, tags=["tasks"])
    router.include_router(pipeline.router, tags=["pipeline"])
    return router


__all__ = ["create_router"]

"""Narrative Planning HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import content, episodes, scripts, workflow

    router = APIRouter()
    router.include_router(episodes.router, tags=["episodes"])
    router.include_router(scripts.router, tags=["scripts"])
    router.include_router(content.router, tags=["content"])
    router.include_router(workflow.router, tags=["workflow"])
    return router


__all__ = ["create_router"]

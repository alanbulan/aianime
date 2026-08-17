"""Production HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import audio, export, pool, render, settings, sketch, video, workflow

    router = APIRouter()
    router.include_router(audio.router, tags=["generation"])
    router.include_router(export.router, tags=["generation"])
    router.include_router(pool.router, tags=["generation"])
    router.include_router(render.router, tags=["generation"])
    router.include_router(settings.router, tags=["generation"])
    router.include_router(sketch.router, tags=["generation"])
    router.include_router(video.router, tags=["generation"])
    router.include_router(workflow.router, tags=["generation"])
    return router


__all__ = ["create_router"]

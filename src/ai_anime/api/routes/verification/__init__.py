"""Verification HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import beat_checks, episode_checks, sketch_quality

    router = APIRouter()
    router.include_router(beat_checks.router)
    router.include_router(episode_checks.router)
    router.include_router(sketch_quality.router)
    return router


__all__ = ["create_router"]

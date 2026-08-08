"""Creative Canvas HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import (
        assets,
        audio,
        bootstrap,
        commits,
        documents,
        image,
        jobs,
        media,
        presets,
        projections,
        skills,
        text,
        video,
    )

    router = APIRouter()
    router.include_router(bootstrap.router)
    router.include_router(assets.router)
    router.include_router(commits.router)
    router.include_router(audio.router)
    router.include_router(documents.router)
    router.include_router(image.router)
    router.include_router(jobs.router)
    router.include_router(media.router)
    router.include_router(presets.router)
    router.include_router(projections.router)
    router.include_router(skills.router)
    router.include_router(text.router)
    router.include_router(video.router)
    return router


__all__ = ["create_router"]

"""Asset World HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import assets, characters, props, scenes, styles, viewer

    router = APIRouter()
    router.include_router(characters.router, tags=["characters"])
    router.include_router(assets.router, tags=["assets"])
    router.include_router(scenes.router, tags=["scenes"])
    router.include_router(props.router, tags=["props"])
    router.include_router(viewer.router, tags=["generation"])
    router.include_router(styles.router, tags=["styles"])
    return router


__all__ = ["create_router"]

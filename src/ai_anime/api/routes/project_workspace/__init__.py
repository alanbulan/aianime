"""Project Workspace HTTP adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import files, projects

    router = APIRouter()
    router.include_router(projects.router, tags=["projects"])
    router.include_router(files.router, tags=["files"])
    return router


__all__ = ["create_router"]

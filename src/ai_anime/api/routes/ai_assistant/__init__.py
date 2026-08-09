"""AI Assistant HTTP and WebSocket adapters."""

from fastapi import APIRouter


def create_router() -> APIRouter:
    from . import chat, http, speech

    router = APIRouter()
    router.include_router(http.router, tags=["chat"])
    router.include_router(chat.router, tags=["chat"])
    router.include_router(speech.router, tags=["chat"])
    return router


__all__ = ["create_router"]

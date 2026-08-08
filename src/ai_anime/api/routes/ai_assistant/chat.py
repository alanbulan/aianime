"""Chat WebSocket route."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

import ai_anime.api.routes.ai_assistant.session as chat_session

router = APIRouter()


@router.websocket("/chat/ws")
async def chat_ws(websocket: WebSocket) -> None:
    await chat_session.run_chat_session(websocket)

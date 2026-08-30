"""Request body size limits."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024
MAX_UPLOAD_REQUEST_BODY_BYTES = 200 * 1024 * 1024


def request_body_limit(request: Request) -> int:
    content_type = request.headers.get("content-type", "").lower()
    if (
        request.url.path.startswith("/api/v1/projects/")
        and request.url.path.endswith("/upload")
        and "multipart/form-data" in content_type
    ):
        return MAX_UPLOAD_REQUEST_BODY_BYTES
    return MAX_REQUEST_BODY_BYTES


def is_freezone_audio_voice_upload(request: Request) -> bool:
    return (
        request.method.upper() == "POST"
        and request.url.path.startswith("/api/v1/projects/")
        and request.url.path.endswith("/freezone/audio/voices")
    )


def _request_body_too_large_response(
    request: Request,
    *,
    limit: int,
    size: int,
) -> JSONResponse:
    if is_freezone_audio_voice_upload(request):
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "error": "参考音频超过 5MB 上限，请压缩或裁剪后重新上传",
                "data": {
                    "code": "freezone_audio_voice_too_large",
                    "field": "file",
                    "limit": limit,
                    "got": size,
                },
            },
        )
    return JSONResponse(
        status_code=413,
        content={
            "detail": {
                "code": "canvas_payload_too_large",
                "field": "body",
                "limit": limit,
                "got": size,
            }
        },
    )


class _RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        limit = request_body_limit(request)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > limit:
                    response = _request_body_too_large_response(
                        request, limit=limit, size=size
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        received = 0
        oversized = 0
        response_started = False
        original_receive = request.receive

        async def limited_receive() -> Message:
            nonlocal oversized, received
            if oversized:
                return {"type": "http.disconnect"}
            message = await original_receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    oversized = received
                    return {"type": "http.disconnect"}
            return message

        async def limited_send(message: Message) -> None:
            nonlocal response_started
            if oversized and not response_started:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, limited_send)
        except BaseException:
            if not oversized or response_started:
                raise
        if oversized and not response_started:
            response = _request_body_too_large_response(
                request, limit=limit, size=oversized
            )
            await response(scope, receive, send)


def install_request_limit_middleware(application: FastAPI) -> None:
    application.add_middleware(_RequestBodyLimitMiddleware)

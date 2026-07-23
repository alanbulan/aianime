"""Request body size limits."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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


def install_request_limit_middleware(application: FastAPI) -> None:
    @application.middleware("http")
    async def _limit_body_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                limit = request_body_limit(request)
                size = int(content_length)
                if size > limit:
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
            except ValueError:
                pass
        return await call_next(request)

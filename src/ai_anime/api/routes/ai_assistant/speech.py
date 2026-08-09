"""Authenticated local speech-to-text endpoint for the desktop client."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.modules.ai_assistant.public import (
    SpeechTranscriptionFailed,
    SpeechTranscriptionUnavailable,
    get_speech_transcription,
)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024


@router.post("/chat/speech/transcribe")
async def transcribe_speech(
    audio: UploadFile = File(...),
    _user: dict = Depends(get_api_user),
) -> dict[str, object]:
    content_type = (audio.content_type or "").lower()
    if content_type and not (
        content_type.startswith("audio/")
        or content_type == "application/octet-stream"
    ):
        raise HTTPException(status_code=415, detail="仅支持音频文件")

    suffix = Path(audio.filename or "recording.webm").suffix[:12] or ".webm"
    temporary_path: Path | None = None
    total_bytes = 0
    try:
        with tempfile.NamedTemporaryFile(
            prefix="ai-anime-speech-",
            suffix=suffix,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            while chunk := await audio.read(READ_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="录音文件过大")
                temporary.write(chunk)
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="录音内容为空")

        try:
            transcript = await get_speech_transcription().transcribe(
                temporary_path,
                language="zh",
            )
        except SpeechTranscriptionUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except SpeechTranscriptionFailed as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        return {
            "ok": True,
            "data": {
                "text": transcript.text,
                "language": transcript.language,
                "durationSeconds": transcript.duration_seconds,
            },
        }
    finally:
        await audio.close()
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


__all__ = ["router"]

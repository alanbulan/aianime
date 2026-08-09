"""Local speech-to-text application contract."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class SpeechTranscriptionUnavailable(RuntimeError):
    """Raised when the bundled local model cannot be used."""


class SpeechTranscriptionFailed(RuntimeError):
    """Raised when an audio file cannot be decoded or transcribed."""


@dataclass(frozen=True)
class SpeechTranscript:
    text: str
    language: str
    duration_seconds: float


class SpeechTranscriber(Protocol):
    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: str,
    ) -> SpeechTranscript: ...


class SpeechTranscription:
    def __init__(self, transcriber: SpeechTranscriber):
        self._transcriber = transcriber

    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: str = "zh",
    ) -> SpeechTranscript:
        return await self._transcriber.transcribe(audio_path, language=language)


__all__ = [
    "SpeechTranscript",
    "SpeechTranscriber",
    "SpeechTranscription",
    "SpeechTranscriptionFailed",
    "SpeechTranscriptionUnavailable",
]

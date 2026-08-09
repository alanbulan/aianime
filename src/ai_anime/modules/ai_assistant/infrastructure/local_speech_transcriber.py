"""CPU-only Faster Whisper adapter for the desktop sidecar."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from pathlib import Path
from typing import Any, Callable

from ai_anime.modules.ai_assistant.application.speech_transcription import (
    SpeechTranscript,
    SpeechTranscriptionFailed,
    SpeechTranscriptionUnavailable,
)

ModelFactory = Callable[[str], Any]
logger = logging.getLogger(__name__)


class LocalSpeechTranscriber:
    def __init__(
        self,
        model_dir: str | Path | None = None,
        *,
        model_factory: ModelFactory | None = None,
    ):
        configured = model_dir or os.environ.get("AI_ANIME_WHISPER_MODEL_DIR", "")
        self._model_dir = Path(configured).expanduser() if configured else None
        self._model_factory = model_factory
        self._model: Any | None = None
        self._lock = threading.Lock()

    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: str,
    ) -> SpeechTranscript:
        return await asyncio.to_thread(
            self._transcribe_sync,
            audio_path,
            language,
        )

    def _transcribe_sync(self, audio_path: Path, language: str) -> SpeechTranscript:
        with self._lock:
            model = self._load_model()
            try:
                segments, info = model.transcribe(
                    str(audio_path),
                    language=language,
                    beam_size=3,
                    vad_filter=True,
                    condition_on_previous_text=False,
                    initial_prompt="以下是普通话的简体中文句子。",
                )
                text = "".join(str(segment.text) for segment in segments).strip()
                detected_language = str(getattr(info, "language", language) or language)
                duration = float(getattr(info, "duration", 0.0) or 0.0)
            except SpeechTranscriptionUnavailable:
                raise
            except Exception as exc:
                logger.exception("Local speech transcription failed")
                raise SpeechTranscriptionFailed("本地语音转写失败") from exc
        return SpeechTranscript(
            text=text,
            language=detected_language,
            duration_seconds=max(0.0, duration),
        )

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        model_dir = self._model_dir
        if not model_dir or not (model_dir / "model.bin").is_file():
            raise SpeechTranscriptionUnavailable("本地语音模型未安装")
        try:
            factory = self._model_factory or _faster_whisper_model
            self._model = factory(str(model_dir))
        except SpeechTranscriptionUnavailable:
            raise
        except Exception as exc:
            raise SpeechTranscriptionUnavailable("本地语音模型加载失败") from exc
        return self._model


def _faster_whisper_model(model_dir: str) -> Any:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SpeechTranscriptionUnavailable("本地语音转写运行时未安装") from exc
    return WhisperModel(
        model_dir,
        device="cpu",
        compute_type="int8",
        local_files_only=True,
    )


__all__ = ["LocalSpeechTranscriber"]

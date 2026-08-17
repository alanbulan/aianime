"""Audio speech generators backed by the selected model-access runtime."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from ai_anime.modules.production.infrastructure.media_generation_settings import (
    get_tts_config,
)
from ai_anime.modules.model_usage.public import write_model_audio_speech
from ai_anime.modules.task_execution.public import TaskCancelled, TaskTimedOut
from ai_anime.modules.task_execution.public import run_project_subprocess


class TTSResult(BaseModel):
    success: bool
    audio_path: Optional[str] = None
    subtitle_path: Optional[str] = None
    duration_seconds: float = 0.0
    error: Optional[str] = None


class CommercialTTSGenerator:
    """Standard ``/audio/speech`` adapter for cloud and professional BYOK."""

    def __init__(
        self,
        *,
        model: str | None = None,
        voice: str | None = None,
        speech_rate: float | None = None,
        response_format: str | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        settings = get_tts_config()
        self.model = str(model or settings["model"] or "").strip()
        self.voice = str(voice or settings["voice"] or "").strip()
        self.speech_rate = float(
            speech_rate if speech_rate is not None else settings["speech_rate"]
        )
        self.response_format = str(
            response_format or settings["response_format"] or "mp3"
        ).strip()
        self.timeout_seconds = float(
            timeout_seconds
            if timeout_seconds is not None
            else settings["timeout_seconds"]
        )

    async def generate(
        self,
        text: str,
        output_path: str,
        voice: str | None = None,
        speech_rate: float | None = None,
        response_format: str | None = None,
        **_kwargs,
    ) -> TTSResult:
        try:
            await write_model_audio_speech(
                output_path=output_path,
                model_role="AUDIO_SPEECH",
                input_text=text,
                voice=voice or self.voice or None,
                speed=(
                    speech_rate
                    if speech_rate is not None
                    else self.speech_rate
                ),
                response_format=response_format or self.response_format,
                timeout_seconds=self.timeout_seconds,
            )
            duration = await self._get_audio_duration(output_path)
            return TTSResult(
                success=True,
                audio_path=output_path,
                duration_seconds=duration,
            )
        except (TaskCancelled, TaskTimedOut):
            raise
        except Exception as exc:
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=detail)

    async def _get_audio_duration(self, audio_path: str) -> float:
        try:
            result = run_project_subprocess(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    audio_path,
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            return float(result.stdout.strip())
        except (TaskCancelled, TaskTimedOut):
            raise
        except Exception:
            return 0.0

    async def generate_batch(
        self,
        texts: list[str],
        output_dir: str,
        filename_prefix: str = "audio",
    ) -> list[TTSResult]:
        os.makedirs(output_dir, exist_ok=True)
        results: list[TTSResult] = []
        for index, text in enumerate(texts, start=1):
            output_path = Path(output_dir) / f"{filename_prefix}_{index:03d}.mp3"
            results.append(await self.generate(text, str(output_path)))
        return results


def create_tts_generator(
    *,
    model: str | None = None,
    voice: str | None = None,
):
    return CommercialTTSGenerator(model=model, voice=voice)

"""Audio speech generators backed by the selected model-access runtime."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from ai_anime.config import get_tts_config
from ai_anime.model_audio_transport import write_model_audio_speech
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
                model=self.model,
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


class MockTTSGenerator:
    """Explicit test generator; never selected by production configuration."""

    async def generate(
        self,
        text: str,
        output_path: str,
        **_kwargs,
    ) -> TTSResult:
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            duration = len(text) / 3.0
            try:
                run_project_subprocess(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        "anullsrc=r=44100:cl=stereo",
                        "-t",
                        str(duration),
                        "-acodec",
                        "libmp3lame",
                        output_path,
                    ],
                    capture_output=True,
                    check=True,
                    timeout=30 * 60,
                )
            except (TaskCancelled, TaskTimedOut):
                raise
            except Exception:
                Path(output_path).write_bytes(b"")
            subtitle_path = str(Path(output_path).with_suffix(".srt"))
            Path(subtitle_path).write_text(
                "1\n"
                f"00:00:00,000 --> 00:00:{int(duration):02d},000\n"
                f"{text[:100]}{'...' if len(text) > 100 else ''}\n",
                encoding="utf-8",
            )
            return TTSResult(
                success=True,
                audio_path=output_path,
                subtitle_path=subtitle_path,
                duration_seconds=duration,
            )
        except (TaskCancelled, TaskTimedOut):
            raise
        except Exception as exc:
            return TTSResult(success=False, error=str(exc))

    async def generate_batch(
        self,
        texts: list[str],
        output_dir: str,
        filename_prefix: str = "audio",
    ) -> list[TTSResult]:
        os.makedirs(output_dir, exist_ok=True)
        return [
            await self.generate(
                text,
                str(Path(output_dir) / f"{filename_prefix}_{index:03d}.mp3"),
            )
            for index, text in enumerate(texts, start=1)
        ]


def create_tts_generator(
    *,
    use_mock: bool = False,
    model: str | None = None,
    voice: str | None = None,
):
    if use_mock:
        return MockTTSGenerator()
    return CommercialTTSGenerator(model=model, voice=voice)

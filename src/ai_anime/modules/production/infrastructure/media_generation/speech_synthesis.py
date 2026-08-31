"""Voice-cloning client for dialogue audio preparation."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.production.infrastructure.media_generation.tts_generator import TTSResult
from ai_anime.modules.model_usage.public import (
    write_model_audio_speech,
)
from ai_anime.modules.model_usage.public import (
    is_model_quota_error,
    resolve_model_for_role,
)
from ai_anime.shared.utils.media_io import get_audio_duration_async

class SpeechSynthesisClient:
    """Speech adapter for the selected cloud/BYOK model access."""

    def __init__(
        self,
        *,
        timeout_seconds: float | None = None,
    ):
        from ai_anime.modules.production.infrastructure.media_generation_settings import (
            SPEECH_GENERATION_TIMEOUT_SECONDS,
        )

        self.model = resolve_model_for_role("AUDIO_VOICE_CLONE")
        self.timeout_seconds = float(
            timeout_seconds if timeout_seconds is not None else SPEECH_GENERATION_TIMEOUT_SECONDS
        )

    async def generate(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: str | Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        """Generate dialogue audio from a reference sample and save it to ``output_path``."""
        prompt = str(prompt or "").strip()
        if not prompt:
            return TTSResult(success=False, error="Speech prompt is empty")
        audio_url = str(audio_url or "").strip()
        if not audio_url:
            return TTSResult(success=False, error="Reference audio is empty")

        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        return await self._generate_via_model_access(
            prompt=prompt,
            audio_url=audio_url,
            output_path=target,
            emotion_prompt=emotion_prompt,
        )

    async def _generate_via_model_access(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        try:
            await write_model_audio_speech(
                output_path=output_path,
                model_role="AUDIO_VOICE_CLONE",
                input_text=prompt,
                reference_audio=audio_url,
                emotion_prompt=emotion_prompt,
                timeout_seconds=self.timeout_seconds,
            )
            if not output_path.exists() or output_path.stat().st_size <= 0:
                return TTSResult(success=False, error="Speech audio file was not created")

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await get_audio_duration_async(str(output_path)),
            )
        except Exception as exc:
            if is_model_quota_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

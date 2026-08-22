"""IndexTTS2 client for Seedance 2.0 dialogue audio preparation."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from ai_anime.modules.production.infrastructure.media_generation.tts_generator import TTSResult
from ai_anime.modules.model_usage.public import (
    ModelAudioTransportError,
    write_model_audio_speech,
)
from ai_anime.modules.model_usage.public import (
    get_usage_meter,
    is_insufficient_credits_error,
    resolve_model_for_role,
)


async def _reserve_tts_model_call(model: str, *, source: str) -> str:
    return await get_usage_meter().reserve_current_model_call_credit(
        model=model,
        billing_kind="audio",
        metadata={"source": source},
    )


async def _refund_tts_model_call(
    reservation_id: str,
    *,
    source: str,
    error: str,
    provider_request_id: str = "",
) -> None:
    if not reservation_id:
        return
    try:
        metadata: dict[str, Any] = {"source": source, "error": error[:200]}
        if provider_request_id:
            metadata["request_id"] = provider_request_id
        await get_usage_meter().refund_model_call_credit_reservation(
            reservation_id,
            metadata=metadata,
        )
    except Exception:
        pass


async def _confirm_tts_model_call(
    *,
    model: str,
    reservation_id: str,
    provider_request_id: str = "",
    response_id: str = "",
) -> None:
    try:
        await get_usage_meter().bump_model_call(
            user_id=None,
            model=model,
            provider_request_id=provider_request_id,
            credit_reservation_id=reservation_id,
            metadata={"response_id": response_id} if response_id else None,
        )
    except Exception:
        pass


async def _audio_duration_seconds(audio_path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


class IndexTTS2Client:
    """IndexTTS2 adapter for the selected cloud/BYOK model access."""

    def __init__(
        self,
        *,
        timeout_seconds: float | None = None,
    ):
        from ai_anime.modules.production.infrastructure.media_generation_settings import (
            INDEXTTS2_TIMEOUT_SECONDS,
        )

        self.model = resolve_model_for_role("AUDIO_VOICE_CLONE")
        self.timeout_seconds = float(
            timeout_seconds if timeout_seconds is not None else INDEXTTS2_TIMEOUT_SECONDS
        )
        self._last_provider_request_id = ""
        self._last_provider_response_id = ""

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
            return TTSResult(success=False, error="IndexTTS2 prompt is empty")
        audio_url = str(audio_url or "").strip()
        if not audio_url:
            return TTSResult(success=False, error="IndexTTS2 audio_url is empty")

        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        self._last_provider_request_id = ""
        self._last_provider_response_id = ""
        source = "indextts2_commercial"
        reservation_id = ""
        try:
            reservation_id = await _reserve_tts_model_call(self.model, source=source)
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

        result = await self._generate_via_model_access(
            prompt=prompt,
            audio_url=audio_url,
            output_path=target,
            emotion_prompt=emotion_prompt,
        )
        if result.success:
            await _confirm_tts_model_call(
                model=self.model,
                reservation_id=reservation_id,
                provider_request_id=self._last_provider_request_id,
                response_id=self._last_provider_response_id,
            )
        else:
            await _refund_tts_model_call(
                reservation_id,
                source=source,
                error=result.error or "tts_generation_failed",
                provider_request_id=self._last_provider_request_id,
            )
        return result

    async def _generate_via_model_access(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        metadata: dict[str, Any] = {
            "audio_url": audio_url,
            "should_use_prompt_for_emotion": True,
        }
        if str(emotion_prompt or "").strip():
            metadata["emotion_prompt"] = str(emotion_prompt).strip()
        try:
            transport_result = await write_model_audio_speech(
                output_path=output_path,
                model_role="AUDIO_VOICE_CLONE",
                input_text=prompt,
                metadata=metadata,
                timeout_seconds=self.timeout_seconds,
            )
            self._last_provider_request_id = transport_result.request_id
            self._last_provider_response_id = transport_result.response_id

            if not output_path.exists() or output_path.stat().st_size <= 0:
                return TTSResult(success=False, error="IndexTTS2 audio file was not created")

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await _audio_duration_seconds(output_path),
            )
        except Exception as exc:
            if isinstance(exc, ModelAudioTransportError):
                self._last_provider_request_id = exc.request_id
                self._last_provider_response_id = exc.response_id
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

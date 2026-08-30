"""IndexTTS2 client for Seedance 2.0 dialogue audio preparation."""

from __future__ import annotations

import logging
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
from ai_anime.shared.utils.document_parsers import count_billable_text_chars
from ai_anime.shared.utils.media_io import get_audio_duration_async


logger = logging.getLogger(__name__)


async def _reserve_tts_model_call(
    model: str,
    *,
    source: str,
    billable_chars: int,
) -> str:
    metrics = {
        "call_count": 1,
        "item_count": 1,
        "billable_chars": max(int(billable_chars or 0), 0),
    }
    return await get_usage_meter().reserve_current_model_call_credit(
        model=model,
        billing_kind="audio",
        billing_params=metrics,
        billing_quantity=1,
        metadata={"source": source, **metrics},
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
        logger.exception(
            "failed to refund IndexTTS2 model call reservation_id=%s source=%s",
            reservation_id,
            source,
        )


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
        logger.exception(
            "failed to confirm IndexTTS2 model call reservation_id=%s model=%s",
            reservation_id,
            model,
        )


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
            reservation_id = await _reserve_tts_model_call(
                self.model,
                source=source,
                billable_chars=count_billable_text_chars(prompt),
            )
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
        try:
            transport_result = await write_model_audio_speech(
                output_path=output_path,
                model_role="AUDIO_VOICE_CLONE",
                input_text=prompt,
                reference_audio=audio_url,
                emotion_prompt=emotion_prompt,
                timeout_seconds=self.timeout_seconds,
            )
            self._last_provider_request_id = transport_result.request_id
            self._last_provider_response_id = transport_result.response_id

            if not output_path.exists() or output_path.stat().st_size <= 0:
                return TTSResult(success=False, error="IndexTTS2 audio file was not created")

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await get_audio_duration_async(str(output_path)),
            )
        except Exception as exc:
            if isinstance(exc, ModelAudioTransportError):
                self._last_provider_request_id = exc.request_id
                self._last_provider_response_id = exc.response_id
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

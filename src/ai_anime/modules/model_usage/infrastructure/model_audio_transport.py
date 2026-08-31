"""Shared OpenAI-compatible audio/speech transport for cloud and BYOK access."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from ai_anime.modules.model_usage.infrastructure.protocol_errors import (
    model_protocol_error_message,
)

AudioSpeechModelRole = Literal["AUDIO_SPEECH", "AUDIO_VOICE_CLONE"]
_AUDIO_SPEECH_MODEL_ROLES = frozenset({"AUDIO_SPEECH", "AUDIO_VOICE_CLONE"})
_MAX_REFERENCE_AUDIO_BYTES = 100 * 1024 * 1024
_FORBIDDEN_TRANSPORT_KEYS = frozenset(
    {"apikey", "authorization", "baseurl", "headers", "xapikey", "xgoogapikey"}
)
_JSON_AUDIO_REFERENCE_KEYS = frozenset(
    {"audio", "inputaudio", "referenceaudio", "voicereference", "audiourl"}
)


@dataclass(frozen=True)
class ModelAudioWriteResult:
    request_id: str = ""
    response_id: str = ""
    voice_id: str = ""


class ModelAudioTransportError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        request_id: str = "",
        response_id: str = "",
    ) -> None:
        super().__init__(message)
        self.request_id = request_id
        self.response_id = response_id


def _normalized_transport_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())


def _reject_transport_fields(value: object, *, path: str = "metadata") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key or "").strip()
            if _normalized_transport_key(key_text) in _FORBIDDEN_TRANSPORT_KEYS:
                raise ValueError(f"{path} cannot contain transport field {key_text}")
            _reject_transport_fields(item, path=f"{path}.{key_text}")
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _reject_transport_fields(item, path=f"{path}[{index}]")


def _safe_error_summary(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except (TypeError, ValueError):
        return f"HTTP {response.status_code}"
    return model_protocol_error_message(payload) or f"HTTP {response.status_code}"


async def write_model_audio_speech(
    *,
    output_path: str | Path,
    model_role: AudioSpeechModelRole,
    input_text: str,
    model_selector: str | None = None,
    response_format: str = "mp3",
    voice: str | None = None,
    speed: float | None = None,
    emotion_prompt: str | None = None,
    metadata: dict[str, Any] | None = None,
    reference_audio: str | Path | None = None,
    timeout_seconds: float = 600.0,
) -> ModelAudioWriteResult:
    """Write one Gateway ``/audio/speech`` response to disk."""
    from ai_anime.modules.model_usage.domain.model_route import resolve_model_route
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        resolve_model_for_role,
    )
    from ai_anime.modules.model_usage.infrastructure.model_runtime import (
        get_model_access_json_transport,
    )

    clean_model_role = str(model_role or "").strip().upper()
    clean_input = str(input_text or "").strip()
    if clean_model_role not in _AUDIO_SPEECH_MODEL_ROLES:
        raise ValueError("audio speech model role is invalid")
    if not clean_input:
        raise ValueError("audio input is required")
    is_voice_clone = clean_model_role == "AUDIO_VOICE_CLONE"
    if is_voice_clone and reference_audio is None:
        raise ValueError("voice clone requires reference audio")
    if not is_voice_clone and reference_audio is not None:
        raise ValueError("speech mode does not accept reference audio")
    clean_emotion_prompt = str(emotion_prompt or "").strip()
    if clean_emotion_prompt and not is_voice_clone:
        raise ValueError("emotion prompt is only supported for voice clone")
    if is_voice_clone and metadata:
        raise ValueError(
            "voice clone metadata is not supported by the Gateway contract"
        )
    route = resolve_model_route(model_selector)
    effective_model = route.model or resolve_model_for_role(clean_model_role)
    _reject_transport_fields(metadata or {})
    for key in metadata or {}:
        if _normalized_transport_key(key) in _JSON_AUDIO_REFERENCE_KEYS:
            raise ValueError(
                f"metadata cannot contain JSON reference audio field {key}"
            )

    base_url, headers = get_model_access_json_transport(
        clean_model_role,
        route.selector or None,
    )
    headers = dict(headers)
    if is_voice_clone:
        headers = {
            key: value
            for key, value in headers.items()
            if key.strip().lower() != "content-type"
        }
    headers["Idempotency-Key"] = str(uuid.uuid4())
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/audio/speech"):
        endpoint = f"{endpoint}/audio/speech"
    body: dict[str, Any] = {
        "model": effective_model,
        "mode": "VOICE_CLONE" if is_voice_clone else "SPEECH",
        "input": clean_input,
        "response_format": str(response_format or "mp3").strip() or "mp3",
    }
    clean_voice = str(voice or "").strip()
    if clean_voice:
        body["voice"] = clean_voice
    if speed is not None:
        body["speed"] = float(speed)
    if clean_emotion_prompt:
        body["emotion_prompt"] = clean_emotion_prompt
    if metadata:
        body["metadata"] = metadata
    return await _write_model_audio_request(
        endpoint=endpoint,
        headers=headers,
        output_path=output_path,
        timeout_seconds=timeout_seconds,
        json_body=None if is_voice_clone else body,
        form_fields=body if is_voice_clone else None,
        reference_audio=reference_audio,
        safe_context={
            "endpoint": endpoint,
            "model": effective_model,
            "model_role": clean_model_role,
            "mode": body["mode"],
            "response_format": body["response_format"],
            "voice": clean_voice,
            "input_chars": len(clean_input),
            "emotion_prompt_chars": len(clean_emotion_prompt),
            "metadata_keys": sorted((metadata or {}).keys()),
        },
    )


async def write_model_audio_music(
    *,
    output_path: str | Path,
    prompt: str,
    duration_seconds: float,
    response_format: str = "mp3",
    parameters: dict[str, Any] | None = None,
    timeout_seconds: float = 900.0,
) -> ModelAudioWriteResult:
    """Write one Gateway ``/audio/music/generations`` response to disk."""
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        resolve_model_for_role,
    )
    from ai_anime.modules.model_usage.infrastructure.model_runtime import (
        get_model_access_json_transport,
    )

    clean_prompt = str(prompt or "").strip()
    if not clean_prompt:
        raise ValueError("music prompt is required")
    duration = float(duration_seconds)
    if duration <= 0:
        raise ValueError("music duration must be positive")
    extra_parameters = dict(parameters or {})
    _reject_transport_fields(extra_parameters, path="parameters")
    reserved = {"model", "mode", "prompt", "duration", "responseformat"}
    for key in extra_parameters:
        if _normalized_transport_key(key) in reserved:
            raise ValueError(f"parameters cannot override music field {key}")

    effective_model = resolve_model_for_role("AUDIO_MUSIC")
    base_url, headers = get_model_access_json_transport("AUDIO_MUSIC")
    headers = dict(headers)
    headers["Idempotency-Key"] = str(uuid.uuid4())
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/audio/music/generations"):
        endpoint = f"{endpoint}/audio/music/generations"
    normalized_duration: int | float = (
        int(duration) if duration.is_integer() else duration
    )
    body: dict[str, Any] = {
        "model": effective_model,
        "mode": "MUSIC",
        "prompt": clean_prompt,
        "duration": normalized_duration,
        "response_format": str(response_format or "mp3").strip() or "mp3",
        **extra_parameters,
    }
    return await _write_model_audio_request(
        endpoint=endpoint,
        headers=headers,
        output_path=output_path,
        timeout_seconds=timeout_seconds,
        json_body=body,
        safe_context={
            "endpoint": endpoint,
            "model": effective_model,
            "model_role": "AUDIO_MUSIC",
            "mode": "MUSIC",
            "response_format": body["response_format"],
            "duration": normalized_duration,
            "parameter_keys": sorted(extra_parameters),
            "prompt_chars": len(clean_prompt),
        },
    )


async def write_model_audio_voice_design(
    *,
    output_path: str | Path,
    voice_prompt: str,
    preview_text: str,
    model_selector: str | None = None,
    preferred_name: str | None = None,
    language: str | None = None,
    sample_rate: int | None = None,
    response_format: str | None = None,
    timeout_seconds: float = 600.0,
) -> ModelAudioWriteResult:
    """Create one voice from text through the Gateway ``VOICE_DESIGN`` mode."""
    from ai_anime.modules.model_usage.domain.model_route import resolve_model_route
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        resolve_model_for_role,
    )
    from ai_anime.modules.model_usage.infrastructure.model_runtime import (
        get_model_access_json_transport,
    )

    clean_prompt = str(voice_prompt or "").strip()
    clean_preview = str(preview_text or "").strip()
    if not clean_prompt:
        raise ValueError("voice prompt is required")
    if not clean_preview:
        raise ValueError("voice design preview text is required")
    route = resolve_model_route(model_selector)
    effective_model = route.model or resolve_model_for_role("AUDIO_VOICE_DESIGN")
    base_url, headers = get_model_access_json_transport(
        "AUDIO_VOICE_DESIGN",
        route.selector or None,
    )
    headers = dict(headers)
    headers["Idempotency-Key"] = str(uuid.uuid4())
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/audio/speech"):
        endpoint = f"{endpoint}/audio/speech"
    body: dict[str, Any] = {
        "model": effective_model,
        "mode": "VOICE_DESIGN",
        "voice_prompt": clean_prompt,
        "preview_text": clean_preview,
    }
    optional_values: tuple[tuple[str, object | None], ...] = (
        ("preferred_name", str(preferred_name or "").strip() or None),
        ("language", str(language or "").strip() or None),
        ("sample_rate", sample_rate),
        ("response_format", str(response_format or "").strip() or None),
    )
    for key, value in optional_values:
        if value is not None:
            body[key] = value
    return await _write_model_audio_request(
        endpoint=endpoint,
        headers=headers,
        output_path=output_path,
        timeout_seconds=timeout_seconds,
        json_body=body,
        safe_context={
            "endpoint": endpoint,
            "model": effective_model,
            "model_role": "AUDIO_VOICE_DESIGN",
            "mode": "VOICE_DESIGN",
            "voice_prompt_chars": len(clean_prompt),
            "preview_text_chars": len(clean_preview),
            "language": body.get("language", ""),
            "sample_rate": body.get("sample_rate", ""),
            "response_format": body.get("response_format", ""),
        },
    )


async def _write_model_audio_request(
    *,
    endpoint: str,
    headers: dict[str, str],
    output_path: str | Path,
    timeout_seconds: float,
    safe_context: dict[str, Any],
    json_body: dict[str, Any] | None = None,
    form_fields: dict[str, Any] | None = None,
    reference_audio: str | Path | None = None,
) -> ModelAudioWriteResult:
    request_id = ""
    response_id = ""
    voice_id = ""
    try:
        client_context = httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
        )
        async with client_context as client:
            if reference_audio is None:
                response = await client.post(endpoint, headers=headers, json=json_body)
            else:
                audio_file = await _reference_audio_file(client, reference_audio)
                response = await client.post(
                    endpoint,
                    headers=headers,
                    data=form_fields,
                    files={"reference_audio": audio_file},
                )
            request_id = _request_id(response.headers)
            voice_id = str(response.headers.get("x-voice-id") or "").strip()
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                error_context = {**safe_context, "request_id": request_id}
                raise ModelAudioTransportError(
                    "model audio request failed: "
                    f"HTTP {exc.response.status_code}; "
                    f"context={json.dumps(error_context, ensure_ascii=False)}; "
                    f"body={_safe_error_summary(exc.response)}",
                    request_id=request_id,
                ) from exc

            content_type = str(response.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                try:
                    payload = response.json()
                except (TypeError, ValueError) as exc:
                    raise ModelAudioTransportError(
                        "model audio response is not valid JSON",
                        request_id=request_id,
                    ) from exc
                if not isinstance(payload, dict):
                    raise ModelAudioTransportError(
                        "model audio response must be an object",
                        request_id=request_id,
                    )
                request_id = (
                    request_id
                    or str(
                        payload.get("request_id") or payload.get("requestId") or ""
                    ).strip()
                )
                response_id = str(payload.get("id") or "").strip()
                protocol_error = model_protocol_error_message(payload)
                if protocol_error:
                    raise ModelAudioTransportError(
                        f"model audio protocol error: {protocol_error}",
                        request_id=request_id,
                        response_id=response_id,
                    )
                try:
                    audio_bytes = await _audio_bytes_from_payload(client, payload)
                except Exception as exc:
                    if isinstance(exc, ModelAudioTransportError):
                        raise
                    raise ModelAudioTransportError(
                        str(exc) or "model audio response could not be resolved",
                        request_id=request_id,
                        response_id=response_id,
                    ) from exc
            else:
                audio_bytes = response.content
    except ModelAudioTransportError:
        raise
    except httpx.TimeoutException as exc:
        raise ModelAudioTransportError(
            "model audio request timed out",
            request_id=request_id,
        ) from exc
    except httpx.RequestError as exc:
        raise ModelAudioTransportError(
            f"model audio transport failed: {exc.__class__.__name__}",
            request_id=request_id,
        ) from exc

    if not audio_bytes:
        raise ModelAudioTransportError(
            "model audio response is empty",
            request_id=request_id,
            response_id=response_id,
        )
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(audio_bytes)
    return ModelAudioWriteResult(
        request_id=request_id,
        response_id=response_id,
        voice_id=voice_id,
    )


async def _reference_audio_file(
    client: httpx.AsyncClient,
    value: str | Path,
) -> tuple[str, bytes, str]:
    raw = str(value).strip()
    if not raw:
        raise ValueError("reference audio is required")

    parsed = urlparse(raw)
    if raw.startswith("data:"):
        metadata, separator, encoded = raw.partition(",")
        content_type = metadata.removeprefix("data:").split(";", 1)[0].lower()
        if not separator or not metadata.lower().endswith(";base64"):
            raise ValueError("reference audio data URL must use base64")
        if not content_type.startswith("audio/"):
            raise ValueError("reference audio data URL must use an audio media type")
        try:
            content = base64.b64decode(encoded, validate=True)
        except (TypeError, ValueError) as exc:
            raise ValueError("reference audio data URL is invalid") from exc
        filename = f"reference{mimetypes.guess_extension(content_type) or '.audio'}"
    elif parsed.scheme in {"http", "https"} and parsed.netloc:
        response = await client.get(raw)
        response.raise_for_status()
        content = response.content
        filename = Path(parsed.path).name or "reference.audio"
        content_type = (
            str(response.headers.get("content-type") or "")
            .split(";", 1)[0]
            .strip()
            .lower()
        )
        if not content_type.startswith("audio/"):
            content_type = mimetypes.guess_type(filename)[0] or ""
    else:
        path = Path(raw)
        if not path.is_file():
            raise ValueError(
                "reference audio must be a local file, data URL, or HTTP URL"
            )
        content = path.read_bytes()
        filename = path.name
        content_type = mimetypes.guess_type(path.name)[0] or ""

    if not content_type.startswith("audio/"):
        raise ValueError("reference audio media type is invalid")
    if not content or len(content) > _MAX_REFERENCE_AUDIO_BYTES:
        raise ValueError("reference audio must be between 1 byte and 100 MiB")
    return filename, content, content_type


async def _audio_bytes_from_payload(
    client: httpx.AsyncClient,
    payload: dict[str, Any],
) -> bytes:
    candidates: list[Any] = [
        payload.get("url"),
        payload.get("audio_url"),
        payload.get("audioUrl"),
        payload.get("b64_json"),
        payload.get("audio"),
    ]
    data = payload.get("data")
    if isinstance(data, list) and data and isinstance(data[0], dict):
        first = data[0]
        candidates.extend(
            [
                first.get("url"),
                first.get("audio_url"),
                first.get("audioUrl"),
                first.get("b64_json"),
                first.get("audio"),
            ]
        )
    for candidate in candidates:
        if isinstance(candidate, dict):
            candidate = candidate.get("url") or candidate.get("data")
        value = str(candidate or "").strip()
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            response = await client.get(value)
            response.raise_for_status()
            return response.content
        if value.startswith("data:") and "," in value:
            value = value.split(",", 1)[1]
        try:
            return base64.b64decode(value, validate=True)
        except (ValueError, TypeError):
            continue
    raise RuntimeError("model audio response missing audio bytes or URL")


def _request_id(headers: httpx.Headers) -> str:
    return headers.get("x-request-id") or ""

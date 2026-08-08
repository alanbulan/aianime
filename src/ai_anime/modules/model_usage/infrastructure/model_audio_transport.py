"""Shared OpenAI-compatible audio/speech transport for cloud and BYOK access."""

from __future__ import annotations

import base64
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

AudioModelRole = Literal["AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"]
_AUDIO_MODEL_ROLES = frozenset(
    {"AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"}
)
_FORBIDDEN_TRANSPORT_KEYS = frozenset(
    {"apikey", "authorization", "baseurl", "headers", "xapikey", "xgoogapikey"}
)


@dataclass(frozen=True)
class ModelAudioWriteResult:
    request_id: str = ""
    response_id: str = ""


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


def _protocol_error_message(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "model request failed")
    if error:
        return str(error)
    status = str(payload.get("status") or "").strip().lower()
    if status in {"failed", "error"}:
        return str(payload.get("message") or "model request failed")
    return ""


def _safe_error_summary(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except (TypeError, ValueError):
        return f"HTTP {response.status_code}"
    return _protocol_error_message(payload) or f"HTTP {response.status_code}"


async def write_model_audio_speech(
    *,
    output_path: str | Path,
    model: str,
    model_role: AudioModelRole,
    input_text: str,
    response_format: str = "mp3",
    voice: str | None = None,
    speed: float | None = None,
    metadata: dict[str, Any] | None = None,
    timeout_seconds: float = 600.0,
) -> ModelAudioWriteResult:
    """Write one standard ``/audio/speech`` response to disk."""
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        require_model_role,
    )
    from ai_anime.modules.model_usage.infrastructure.model_runtime import (
        get_model_access_json_transport,
    )

    clean_model = str(model or "").strip()
    clean_model_role = str(model_role or "").strip().upper()
    clean_input = str(input_text or "").strip()
    if not clean_model:
        raise ValueError("audio model is required")
    if clean_model_role not in _AUDIO_MODEL_ROLES:
        raise ValueError("audio model role is invalid")
    if not clean_input:
        raise ValueError("audio input is required")
    require_model_role(clean_model, clean_model_role)
    _reject_transport_fields(metadata or {})

    base_url, headers = get_model_access_json_transport()
    headers = dict(headers)
    headers["Idempotency-Key"] = str(uuid.uuid4())
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/audio/speech"):
        endpoint = f"{endpoint}/audio/speech"
    body: dict[str, Any] = {
        "model": clean_model,
        "input": clean_input,
        "response_format": str(response_format or "mp3").strip() or "mp3",
    }
    clean_voice = str(voice or "").strip()
    if clean_voice:
        body["voice"] = clean_voice
    if speed is not None:
        body["speed"] = float(speed)
    if metadata:
        body["metadata"] = metadata

    request_id = ""
    try:
        client_context = httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
        )
        async with client_context as client:
            response = await client.post(endpoint, headers=headers, json=body)
            request_id = _request_id(response.headers)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                safe_context = {
                    "endpoint": endpoint,
                    "model": clean_model,
                    "model_role": clean_model_role,
                    "response_format": body["response_format"],
                    "voice": clean_voice,
                    "input_chars": len(clean_input),
                    "metadata_keys": sorted((metadata or {}).keys()),
                    "request_id": request_id,
                }
                raise ModelAudioTransportError(
                    "model audio request failed: "
                    f"HTTP {exc.response.status_code}; "
                    f"context={json.dumps(safe_context, ensure_ascii=False)}; "
                    f"body={_safe_error_summary(exc.response)}",
                    request_id=request_id,
                ) from exc

            response_id = ""
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
                request_id = request_id or str(
                    payload.get("request_id") or payload.get("requestId") or ""
                ).strip()
                response_id = str(payload.get("id") or "").strip()
                protocol_error = _protocol_error_message(payload)
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
    return ModelAudioWriteResult(request_id=request_id, response_id=response_id)


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
    return (
        headers.get("x-request-id")
        or headers.get("x-newapi-request-id")
        or headers.get("x-oneapi-request-id")
        or ""
    )

"""Shared OpenAI-compatible JSON text transport for cloud and BYOK access."""

from __future__ import annotations

import uuid
from typing import Any

import httpx

from ai_anime.modules.model_usage.infrastructure.protocol_errors import (
    model_protocol_error_message,
)


class ModelTextTransportError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        request_id: str = "",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.request_id = request_id


async def request_model_chat_content(
    *,
    messages: list[dict[str, Any]],
    max_tokens: int | None = None,
    temperature: float = 0.0,
    response_format: dict[str, Any] | None = None,
    timeout_seconds: float = 120.0,
) -> str:
    """Return message content from one standard ``/chat/completions`` call."""
    from ai_anime.modules.model_usage.infrastructure.model_access_policy import (
        resolve_model_for_role,
    )
    from ai_anime.modules.model_usage.infrastructure.model_runtime import (
        get_model_access_json_transport,
    )

    if not messages:
        raise ValueError("text model messages are required")
    if max_tokens is not None and int(max_tokens) <= 0:
        raise ValueError("max_tokens must be positive")
    effective_model = resolve_model_for_role("TEXT")

    base_url, transport_headers = get_model_access_json_transport("TEXT")
    headers = dict(transport_headers)
    headers["Idempotency-Key"] = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "model": effective_model,
        "temperature": float(temperature),
        "messages": messages,
    }
    if max_tokens is not None:
        payload["max_tokens"] = int(max_tokens)
    if response_format is not None:
        payload["response_format"] = response_format

    request_id = ""
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
        request_id = _request_id(response.headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ModelTextTransportError(
                _response_error_message(exc.response) or f"HTTP {exc.response.status_code}",
                status=exc.response.status_code,
                request_id=request_id,
            ) from exc
    except ModelTextTransportError:
        raise
    except httpx.TimeoutException as exc:
        raise ModelTextTransportError(
            "text model request timed out",
            request_id=request_id,
        ) from exc
    except httpx.RequestError as exc:
        raise ModelTextTransportError(
            f"text model transport failed: {exc.__class__.__name__}",
            request_id=request_id,
        ) from exc

    try:
        data = response.json()
    except (TypeError, ValueError) as exc:
        raise ModelTextTransportError(
            "text model response is not valid JSON",
            status=response.status_code,
            request_id=request_id,
        ) from exc
    if not isinstance(data, dict):
        raise ModelTextTransportError(
            "text model response must be an object",
            status=response.status_code,
            request_id=request_id,
        )
    request_id = request_id or str(
        data.get("request_id") or data.get("requestId") or ""
    ).strip()
    protocol_error = model_protocol_error_message(data)
    if protocol_error:
        raise ModelTextTransportError(
            f"text model protocol error: {protocol_error}",
            status=response.status_code,
            request_id=request_id,
        )

    choices = data.get("choices") or []
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message") or {}
    if not isinstance(message, dict):
        return ""
    return _message_content_text(message.get("content"))


def _message_content_text(content: object) -> str:
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, dict):
            text = text.get("value")
        if text:
            parts.append(str(text))
    return "".join(parts).strip()


def _response_error_message(response: httpx.Response) -> str:
    try:
        return model_protocol_error_message(response.json())
    except (TypeError, ValueError):
        return ""


def _request_id(headers: httpx.Headers) -> str:
    return headers.get("x-request-id") or ""

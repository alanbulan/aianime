"""Shared provider protocol error-envelope parsing."""

from __future__ import annotations


def model_protocol_error_message(payload: object, fallback: str = "") -> str:
    if not isinstance(payload, dict):
        return fallback
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "model request failed")
    if error:
        return str(error)
    status = str(payload.get("status") or "").strip().lower()
    if status in {"failed", "error"}:
        return str(
            payload.get("message")
            or payload.get("detail")
            or payload.get("fail_reason")
            or fallback
            or "model request failed"
        )
    if fallback:
        for key in ("message", "detail", "fail_reason"):
            value = payload.get(key)
            if value:
                return str(value)
    return fallback


__all__ = ["model_protocol_error_message"]

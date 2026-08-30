"""Shared provider protocol error-envelope parsing."""

from __future__ import annotations


def model_protocol_error_message(payload: object) -> str:
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


__all__ = ["model_protocol_error_message"]

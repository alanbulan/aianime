"""Stable data-plane ports."""

from __future__ import annotations

from ai_anime.shared.ports.registry import get_port


def get_task_backend():
    return get_port("task_backend")


def get_cancellation_store():
    return get_port("cancellation_store")


def get_audit_sink():
    return get_port("audit_sink")


def get_lifecycle_port():
    return get_port("lifecycle")


__all__ = [
    "get_audit_sink",
    "get_cancellation_store",
    "get_lifecycle_port",
    "get_task_backend",
]

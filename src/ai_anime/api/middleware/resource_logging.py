"""Request metrics for project media resources."""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter

from fastapi import FastAPI, Request

logger = logging.getLogger("ai_anime.api.app")

_RESOURCE_REQUEST_COUNTS: Counter[str] = Counter()
_RESOURCE_REQUEST_TOTAL = 0
_RESOURCE_REQUEST_LOCK = threading.Lock()


def resource_request_key(path: str) -> str | None:
    if path.startswith("/static/"):
        return path
    if not path.startswith("/api/v1/projects/"):
        return None

    parts = path.split("/")
    if len(parts) >= 6 and parts[4] in {"media", "files"}:
        return path
    return None


def record_resource_request(resource_key: str) -> tuple[int, int]:
    global _RESOURCE_REQUEST_TOTAL
    with _RESOURCE_REQUEST_LOCK:
        _RESOURCE_REQUEST_TOTAL += 1
        _RESOURCE_REQUEST_COUNTS[resource_key] += 1
        return _RESOURCE_REQUEST_TOTAL, _RESOURCE_REQUEST_COUNTS[resource_key]


def install_resource_logging_middleware(application: FastAPI) -> None:
    @application.middleware("http")
    async def _log_resource_requests(request: Request, call_next):
        resource_key = resource_request_key(request.url.path)
        if resource_key is None:
            return await call_next(request)

        started_at = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started_at) * 1000
        total_count, same_resource_count = record_resource_request(resource_key)

        logger.info(
            "resource request total=%s same_resource=%s method=%s status=%s "
            "duration_ms=%.1f path=%s query=%s range=%s bytes=%s content_type=%s",
            total_count,
            same_resource_count,
            request.method,
            response.status_code,
            duration_ms,
            resource_key,
            request.url.query or "-",
            request.headers.get("range", "") or "-",
            response.headers.get("content-length", "") or "-",
            response.headers.get("content-type", "") or "-",
        )
        return response

"""Explicit cancellation bridge from project tasks to the Electron model proxy."""

import logging
import os
import re
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

_PROXY_BASE_URL_ENV = "AI_ANIME_CLOUD_PROXY_BASE_URL"
_PROXY_TOKEN_ENV = "AI_ANIME_CLOUD_PROXY_TOKEN"
_TASK_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


async def request_model_invocation_cancellation(
    task_id: str,
    *,
    reason: str,
) -> bool:
    """Persist cancellation for every image invocation owned by one local task."""
    base_url = os.environ.get(_PROXY_BASE_URL_ENV, "").strip().rstrip("/")
    token = os.environ.get(_PROXY_TOKEN_ENV, "").strip()
    normalized_task_id = str(task_id).strip().lower()
    normalized_reason = str(reason).strip()[:500]
    if (
        not base_url
        or not token
        or _TASK_ID_PATTERN.fullmatch(normalized_task_id) is None
        or not _is_loopback_proxy(base_url)
    ):
        return False
    if not normalized_reason:
        normalized_reason = "local project task was explicitly cancelled"

    try:
        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            response = await client.post(
                f"{base_url}/_aigo/model-invocations/tasks/{normalized_task_id}/cancel",
                headers={"Authorization": f"Bearer {token}"},
                json={"reason": normalized_reason},
            )
        response.raise_for_status()
        return True
    except Exception as exc:
        logger.warning(
            "Failed to persist model invocation cancellation for task %s: %s",
            normalized_task_id,
            exc,
        )
        return False


def _is_loopback_proxy(base_url: str) -> bool:
    try:
        parsed = urlsplit(base_url)
        return (
            parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "::1", "localhost"}
            and parsed.username is None
            and parsed.password is None
            and parsed.path == "/v1"
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False

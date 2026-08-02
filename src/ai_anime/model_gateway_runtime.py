"""CE cache invalidation helpers for dynamic model gateway settings."""

from __future__ import annotations

import hashlib
import sys
from typing import Any

from ai_anime.model_gateway_settings import get_effective_newapi_config
from ai_anime.shared.runtime_env import is_ce_effective


def _runtime_version(api_key: str, base_url: str) -> str:
    material = f"{base_url}\n{api_key}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()[:16]


def _clear_agent_singletons() -> list[str]:
    cleared: list[str] = []
    targets = {
        "ai_anime.agents.global_video_optimizer": ("_global_video_optimizer",),
    }
    for module_name, attrs in targets.items():
        module = sys.modules.get(module_name)
        if module is None:
            continue
        for attr in attrs:
            if hasattr(module, attr):
                setattr(module, attr, None)
                cleared.append(f"{module_name}.{attr}")
    return cleared


def _cognee_runtime_status() -> str:
    module = sys.modules.get("ai_anime.cognee.config")
    if module is None:
        return "not_loaded"
    restart_required = getattr(module, "cognee_gateway_restart_required", None)
    if callable(restart_required) and restart_required():
        return "restart_required"
    return "ready"


def refresh_model_gateway_runtime() -> dict[str, Any]:
    """Invalidate CE caches after a model gateway settings.db write.

    Dynamic CE settings are never copied into process environment variables.
    Cognee is process-global and must be restarted after its active gateway
    changes; Hermes performs its own worker fingerprint rotation.
    """

    if not is_ce_effective():
        raise RuntimeError("model gateway runtime refresh is only available in CE")

    gateway = get_effective_newapi_config()
    api_key = str(gateway.api_key or "").strip()
    base_url = str(gateway.base_url or "").strip().rstrip("/")
    version = _runtime_version(api_key, base_url)

    cleared = _clear_agent_singletons()

    return {
        "mode": gateway.mode,
        "source": gateway.source,
        "configured": bool(base_url and (gateway.mode == "byok" or api_key)),
        "runtimeVersion": version,
        "clearedCaches": cleared,
        "cognee": _cognee_runtime_status(),
    }

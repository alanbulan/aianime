"""HTTP adapter for display-tool fallback queries."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request, urlopen

from ai_anime.chat.runtime_config import load_api_url


class HttpDisplayFallbackGateway:
    def get(self, path: str, token: str) -> dict[str, Any]:
        base_url = load_api_url()
        request = Request(
            f"{base_url.rstrip('/')}{path}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "ai-anime-chat-fallback/0.1.0",
            },
            method="GET",
        )
        with urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8", errors="replace")
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return {"ok": False, "error": text[:500]}
        return value if isinstance(value, dict) else {"ok": True, "data": value}


__all__ = ["HttpDisplayFallbackGateway"]

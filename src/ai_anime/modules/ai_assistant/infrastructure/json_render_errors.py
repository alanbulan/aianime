"""JSON Render error reporting through the configured application logger."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


class FileJsonRenderErrors:
    def __init__(self, repo_root: Path | None = None) -> None:
        self._explicit_root = repo_root

    def path(self) -> Path | None:
        configured = os.environ.get("JR_ERROR_LOG", "").strip()
        if configured:
            return Path(configured).expanduser()
        if self._explicit_root is not None:
            return self._explicit_root / "jr_error.log"
        return None

    def record(self, error: ValueError, body: str) -> None:
        original_body = str(body or "")
        raw_body = original_body
        max_chars = 12000
        if len(raw_body) > max_chars:
            raw_body = (
                f"{raw_body[:max_chars]}\n"
                f"...[truncated {len(original_body) - max_chars} chars]"
            )
        path = self.path()
        if path is None:
            logger.warning("JSON Render validation failed: %s; body=%s", error, raw_body)
            return
        created_at = datetime.now(timezone.utc).isoformat()
        entry = f"\n--- {created_at} ---\nerror: {error}\nbody:\n{raw_body}\n"
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(entry)
        except OSError:
            return

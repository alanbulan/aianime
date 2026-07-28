"""File-backed JSON Render error reporting."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path


class FileJsonRenderErrors:
    def __init__(self, repo_root: Path | None = None) -> None:
        self._repo_root = (
            repo_root if repo_root is not None else Path(__file__).resolve().parents[5]
        )

    def path(self) -> Path:
        configured = os.environ.get("JR_ERROR_LOG", "").strip()
        if configured:
            return Path(configured).expanduser()
        return self._repo_root / "jr_error.log"

    def record(self, error: ValueError, body: str) -> None:
        original_body = str(body or "")
        raw_body = original_body
        max_chars = 12000
        if len(raw_body) > max_chars:
            raw_body = (
                f"{raw_body[:max_chars]}\n"
                f"...[truncated {len(original_body) - max_chars} chars]"
            )
        created_at = datetime.now(timezone.utc).isoformat()
        entry = f"\n--- {created_at} ---\nerror: {error}\nbody:\n{raw_body}\n"
        try:
            path = self.path()
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(entry)
        except OSError:
            return

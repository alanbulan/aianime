"""Local AI Assistant state paths."""

import os
from pathlib import Path


def local_state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[5] / "state"

"""Local AI Assistant state paths."""

import os
from pathlib import Path

from ai_anime.shared.runtime_dotenv import project_root


def local_state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    data_root = os.environ.get("AI_ANIME_DATA_ROOT", "").strip()
    if data_root:
        return Path(data_root).expanduser().resolve() / "state"
    return (project_root() / "state").resolve()

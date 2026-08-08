"""Process-wide data, state, and runtime directory roots."""

from __future__ import annotations

import os

from ai_anime.shared.runtime_dotenv import load_project_dotenv

load_project_dotenv()

DATA_ROOT = os.path.abspath(os.environ.get("AI_ANIME_DATA_ROOT", "."))
OUTPUT_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_OUTPUT_DIR", os.path.join(DATA_ROOT, "output"))
)
STATE_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_STATE_DIR", os.path.join(DATA_ROOT, "state"))
)
RUNTIME_DIR = os.path.abspath(
    os.environ.get("AI_ANIME_RUNTIME_DIR", os.path.join(DATA_ROOT, "runtime"))
)

__all__ = ["DATA_ROOT", "OUTPUT_DIR", "RUNTIME_DIR", "STATE_DIR"]

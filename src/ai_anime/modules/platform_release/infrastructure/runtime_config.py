"""Process-backed runtime configuration environment."""

from __future__ import annotations

import os

from ulid import ULID

from ai_anime.modules.platform_release.domain import RuntimeEdition
from ai_anime.shared import runtime_env


class ProcessRuntimeConfigEnvironment:
    def __init__(self, *, instance_id: str | None = None) -> None:
        self._instance_id = instance_id or str(ULID())

    @property
    def instance_id(self) -> str:
        return self._instance_id

    def edition(self) -> RuntimeEdition:
        return "ce" if runtime_env.is_ce_effective() else "ee"

    def desktop_mode_enabled(self) -> bool:
        return os.environ.get("AI_ANIME_DESKTOP_MODE") == "1"

"""Runtime configuration query."""

from __future__ import annotations

from typing import Protocol

from ai_anime.modules.platform_release.domain import (
    RuntimeConfig,
    RuntimeEdition,
    build_runtime_config,
)


class RuntimeConfigEnvironment(Protocol):
    @property
    def instance_id(self) -> str: ...

    def edition(self) -> RuntimeEdition: ...

    def desktop_mode_enabled(self) -> bool: ...


class RuntimeConfigQueries:
    def __init__(self, environment: RuntimeConfigEnvironment) -> None:
        self._environment = environment

    def current(self) -> RuntimeConfig:
        return build_runtime_config(
            edition=self._environment.edition(),
            desktop_mode=self._environment.desktop_mode_enabled(),
            instance_id=self._environment.instance_id,
        )

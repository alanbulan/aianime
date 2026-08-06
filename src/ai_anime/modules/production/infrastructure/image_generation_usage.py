"""Adapters for image generation usage and operator verification."""

from __future__ import annotations

from pathlib import Path

from ai_anime.image_request_usage import (
    count_image_scope_attempts,
    get_image_usage_summary,
)
from ai_anime.modules.production.infrastructure.operator_auth import get_prompt_export_password


class SqliteProductionImageUsage:
    def summary(
        self,
        project_output_dir: Path,
        *,
        task_types: tuple[str, ...] | None = None,
        episode: int | None = None,
    ) -> dict[str, int]:
        return get_image_usage_summary(
            project_output_dir=project_output_dir,
            task_types=task_types,
            episode=episode,
        )

    def count_scope_attempts(
        self,
        project_output_dir: Path,
        *,
        task_type: str,
        scope: str,
        episode: int | None = None,
    ) -> int:
        return count_image_scope_attempts(
            project_output_dir=project_output_dir,
            task_type=task_type,
            scope=scope,
            episode=episode,
        )


class ConfiguredOperatorPasswordVerifier:
    def verify(self, candidate: str) -> bool:
        configured = get_prompt_export_password()
        return bool(configured) and (candidate or "") == configured

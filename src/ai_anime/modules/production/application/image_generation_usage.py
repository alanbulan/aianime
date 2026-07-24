"""Image generation usage and guard application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ai_anime.modules.production.application.ports import (
    ProductionImageUsageReader,
    ProductionOperatorPasswordVerifier,
)
from ai_anime.modules.production.domain.image_generation_guard import (
    ImageGenerationGuard,
    image_generation_guard,
)

SKETCH_IMAGE_USAGE_TASK_TYPES = ("sketch_grid",)


@dataclass(frozen=True)
class ImageGenerationGuardQuery:
    project_dir: Path
    episode_num: int
    task_type: str
    scope: str
    subject: str


class ImageGenerationUsageUseCases:
    def __init__(
        self,
        usage: ProductionImageUsageReader,
        passwords: ProductionOperatorPasswordVerifier,
    ) -> None:
        self._usage = usage
        self._passwords = passwords

    def sketch_usage(self, project_dir: Path, episode_num: int) -> dict[str, int]:
        return self._usage.summary(
            project_dir,
            task_types=SKETCH_IMAGE_USAGE_TASK_TYPES,
            episode=episode_num,
        )

    def guard(self, query: ImageGenerationGuardQuery) -> ImageGenerationGuard:
        attempt_count = self._usage.count_scope_attempts(
            query.project_dir,
            task_type=query.task_type,
            scope=query.scope,
            episode=query.episode_num,
        )
        return image_generation_guard(attempt_count, query.subject)

    def verify_operator_password(self, candidate: str) -> bool:
        return self._passwords.verify(candidate)

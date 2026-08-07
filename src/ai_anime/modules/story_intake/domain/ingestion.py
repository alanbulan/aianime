"""Rules for starting or rebuilding a story ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SpineTemplate = Literal["drama", "narrated"]
MAX_STORY_UPLOAD_BYTES = 512 * 1024
MAX_STORY_IMPORT_BYTES = 1024 * 1024


class SpineTemplateChangeRequiresRebuild(ValueError):
    """Raised when a project spine is changed without rebuilding its import."""


@dataclass(frozen=True)
class IngestionOptions:
    rebuild: bool = False
    spine_template: SpineTemplate | None = None

    def task_config(self) -> dict[str, bool | str]:
        if self.spine_template is not None and not self.rebuild:
            raise SpineTemplateChangeRequiresRebuild

        config: dict[str, bool | str] = {"rebuild": self.rebuild}
        if self.spine_template is not None:
            config["spine_template"] = self.spine_template
        return config

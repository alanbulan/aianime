"""Rules for starting or rebuilding a story ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SpineTemplate = Literal["drama", "narrated"]
MAX_STORY_UPLOAD_BYTES = 512 * 1024
MAX_STORY_IMPORT_BYTES = 1024 * 1024
MAX_STORY_IMPORT_CHARS = 100_000
STORY_UPLOAD_PREVIEW_CHARS = 3_000


class SpineTemplateChangeRequiresRebuild(ValueError):
    """Raised when a project spine is changed without rebuilding its import."""

    def __init__(
        self,
        current_spine_template: SpineTemplate,
        requested_spine_template: SpineTemplate,
    ) -> None:
        self.current_spine_template = current_spine_template
        self.requested_spine_template = requested_spine_template
        super().__init__(
            "项目类型发生变化，必须使用重新导入后再继续生产"
            f"（{current_spine_template} -> {requested_spine_template}）"
        )


@dataclass(frozen=True)
class IngestionOptions:
    rebuild: bool = False
    spine_template: SpineTemplate | None = None
    current_spine_template: SpineTemplate = "drama"

    def task_config(self) -> dict[str, bool | str]:
        if (
            self.spine_template is not None
            and self.spine_template != self.current_spine_template
            and not self.rebuild
        ):
            raise SpineTemplateChangeRequiresRebuild(
                self.current_spine_template,
                self.spine_template,
            )

        config: dict[str, bool | str] = {"rebuild": self.rebuild}
        if self.spine_template is not None:
            config["spine_template"] = self.spine_template
        return config

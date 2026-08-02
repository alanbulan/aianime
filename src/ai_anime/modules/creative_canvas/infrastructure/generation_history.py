"""Local generation-history writer for Creative Canvas."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.creative_canvas.application.generation_history import (
    RecordCreativeCanvasGenerationCommand,
)
from ai_anime.modules.creative_canvas.infrastructure.history import (
    append_generation_history,
    build_node_history_record,
)


class LocalCreativeCanvasGenerationHistoryWriter:
    def append(
        self,
        command: RecordCreativeCanvasGenerationCommand,
    ) -> dict[str, Any] | None:
        record = build_node_history_record(
            task_type=command.task_type,
            job_id=command.job_id,
            task_key=command.task_key,
            status=command.status,
            media_type=command.media_type,
            result=command.result,
            error=command.error,
            prompt=command.prompt,
            extra=command.extra,
        )
        return append_generation_history(
            project_dir=command.project_dir,
            canvas_id=command.canvas_id,
            node_id=command.node_id,
            record=record,
        )

"""Creative Canvas task-output workspace contract."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol


class CreativeCanvasJobWorkspace(Protocol):
    def initialize(self, project_dir: Path) -> None: ...

    def output_directory(self, project_dir: Path, task_type: str) -> Path: ...

    def image_output_path(
        self,
        project_dir: Path,
        task_type: str,
        job_id: str,
    ) -> Path: ...

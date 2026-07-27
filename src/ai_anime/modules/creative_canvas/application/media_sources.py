"""Creative Canvas project media source ports."""

from pathlib import Path
from typing import Protocol


class CreativeCanvasMediaSourceResolver(Protocol):
    def resolve(self, project_dir: Path, source_url: str) -> Path: ...


class CreativeCanvasExistingMediaSourceResolver(
    CreativeCanvasMediaSourceResolver,
    Protocol,
):
    def exists(self, media_path: Path) -> bool: ...

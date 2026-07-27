"""Creative Canvas image source ports."""

from pathlib import Path
from typing import Protocol


class CreativeCanvasImageSourceResolver(Protocol):
    def resolve(self, project_dir: Path, source_url: str) -> Path: ...


class CreativeCanvasExistingImageSourceResolver(
    CreativeCanvasImageSourceResolver,
    Protocol,
):
    def exists(self, image_path: Path) -> bool: ...

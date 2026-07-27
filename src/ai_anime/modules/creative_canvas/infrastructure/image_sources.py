"""Creative Canvas project image source adapter."""

from pathlib import Path

from ai_anime.freezone.paths import resolve_static_url_to_path


class ProjectCreativeCanvasImageSourceResolver:
    def resolve(self, project_dir: Path, source_url: str) -> Path:
        return resolve_static_url_to_path(source_url, project_dir)

    def exists(self, image_path: Path) -> bool:
        return image_path.exists()

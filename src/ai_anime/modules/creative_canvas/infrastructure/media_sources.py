"""Creative Canvas project media source adapter."""

from pathlib import Path

from ai_anime.shared.project_media import resolve_project_media_path


class ProjectCreativeCanvasMediaSourceResolver:
    def resolve(self, project_dir: Path, source_url: str) -> Path:
        return resolve_project_media_path(source_url, project_dir)

    def exists(self, media_path: Path) -> bool:
        return media_path.exists()

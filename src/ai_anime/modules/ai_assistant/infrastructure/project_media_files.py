"""Local file adapter for project-chat media projection."""

from __future__ import annotations

import os
from pathlib import Path

from ai_anime.utils.static_urls import project_static_url


class LocalProjectMediaFiles:
    def resolve_project_dir(
        self,
        username: str,
        project: str,
        project_dir: str | Path | None = None,
    ) -> Path:
        if project_dir is not None:
            return Path(project_dir)
        base_dir = self._output_root() / username / project
        for path in (
            base_dir,
            base_dir / "graph",
            base_dir / "assets",
            base_dir / "assets" / "characters",
            base_dir / "scripts",
            base_dir / "images",
            base_dir / "audio",
            base_dir / "videos",
            base_dir / "uploads",
        ):
            path.mkdir(parents=True, exist_ok=True)
        return base_dir

    @staticmethod
    def exists(project_dir: Path, relative_path: str) -> bool:
        return (project_dir / relative_path).exists()

    @staticmethod
    def static_url(
        project: str,
        project_dir: Path,
        relative_path: str,
    ) -> str:
        return project_static_url(
            project,
            relative_path,
            local_path=project_dir / relative_path,
        )

    @staticmethod
    def _output_root() -> Path:
        configured = os.environ.get("AI_ANIME_OUTPUT_DIR", "").strip()
        if configured:
            return Path(configured).expanduser()
        return Path(__file__).resolve().parents[5] / "output"


__all__ = ["LocalProjectMediaFiles"]

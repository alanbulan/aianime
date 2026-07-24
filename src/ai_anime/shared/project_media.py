"""Project media URL helpers independent from the HTTP adapter."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.utils.static_urls import project_static_url


def make_project_static_url(
    ctx: ProjectContext,
    relative_path: str,
    local_path: str | Path | None = None,
) -> str:
    """Build the canonical protected URL for a project-owned media file."""
    resolved_local_path = (
        local_path if local_path is not None else Path(ctx.output_dir) / relative_path
    )
    return project_static_url(
        ctx.project_id,
        relative_path,
        local_path=resolved_local_path,
    )


def make_static_url_for_context(
    ctx: ProjectContext,
    relative_path: str,
    local_path: str | Path | None = None,
) -> str:
    """Compatibility name used by existing routes and task runners."""
    return make_project_static_url(ctx, relative_path, local_path=local_path)


def make_project_asset_url_builder(
    ctx: ProjectContext,
    project_dir: str | Path,
    static_url_builder: Callable[..., str] = make_project_static_url,
) -> Callable[[str | Path], str]:
    """Build URLs only for existing paths lexically owned by one project."""
    project_root = Path(project_dir)

    def asset_url(asset_path: str | Path) -> str:
        path = Path(asset_path)
        if not path.exists():
            return ""
        try:
            relative_path = path.relative_to(project_root).as_posix()
        except ValueError:
            return ""
        return static_url_builder(ctx, relative_path, local_path=path)

    return asset_url


__all__ = [
    "make_project_asset_url_builder",
    "make_project_static_url",
    "make_static_url_for_context",
]

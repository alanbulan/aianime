"""Project media URL helpers independent from the HTTP adapter."""

from __future__ import annotations

from pathlib import Path

from ai_anime.project_context import ProjectContext
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


__all__ = ["make_project_static_url", "make_static_url_for_context"]

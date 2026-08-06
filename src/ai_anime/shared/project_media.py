"""Project media URL helpers independent from the HTTP adapter."""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from urllib.parse import unquote, urlsplit

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.utils.static_urls import project_static_url


_PROJECT_STATIC_RE = re.compile(
    r"^/static/(?P<owner>[^/]+)/(?P<project>[^/]+)/(?P<rel>.+)$"
)
_PROJECT_MEDIA_RE = re.compile(
    r"^/api/v1/projects/(?P<project>[^/]+)/media/(?P<rel>.+)$"
)


def resolve_project_media_path(url: str, project_dir: Path) -> Path:
    """Resolve a project media URL without allowing traversal outside the project."""
    clean_path = urlsplit(url).path or url
    candidate: Path
    if clean_path.startswith("/static/"):
        match = _PROJECT_STATIC_RE.match(clean_path)
        if not match:
            raise ValueError(f"unrecognized static url: {clean_path!r}")
        candidate = project_dir / unquote(match.group("rel"))
    elif clean_path.startswith("/api/v1/projects/"):
        match = _PROJECT_MEDIA_RE.match(clean_path)
        if not match:
            raise ValueError(f"unrecognized media url: {clean_path!r}")
        candidate = project_dir / unquote(match.group("rel"))
    elif clean_path.startswith("/"):
        candidate = project_dir / unquote(clean_path.lstrip("/"))
    else:
        candidate = project_dir / unquote(clean_path)

    resolved = candidate.resolve()
    try:
        resolved.relative_to(project_dir.resolve())
    except ValueError as exc:
        raise ValueError(f"url resolves outside project: {clean_path!r}") from exc
    return resolved


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
    "resolve_project_media_path",
]

"""Project-chat media projection use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.application.ports import ProjectMediaFiles
from ai_anime.modules.ai_assistant.domain import (
    canonical_media_path,
    content_media_urls,
    content_relative_media_paths,
    is_markdown_image_ref,
    markdown_image_refs,
    media_kind,
    media_path_from_static_url,
    normalize_media_source,
)


class ProjectMedia:
    def __init__(self, files: ProjectMediaFiles) -> None:
        self._files = files

    def extract(
        self,
        content: str,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, str]]:
        media_project_dir = self._files.resolve_project_dir(
            username,
            project,
            project_dir,
        )
        items: list[dict[str, str]] = []
        seen: set[str] = set()
        markdown_images = markdown_image_refs(content)

        def add_item(raw_url: str, path: str | None = None) -> None:
            candidate = normalize_media_source(raw_url)
            if candidate.startswith("/static/"):
                canonical = self._canonical_static_media(
                    project,
                    media_project_dir,
                    candidate,
                )
                if canonical is None:
                    return
                candidate, path = canonical
            kind = media_kind(candidate)
            if not kind:
                return
            if kind == "image" and is_markdown_image_ref(
                candidate,
                path or "",
                markdown_images,
            ):
                return
            effective_path = path or media_path_from_static_url(candidate) or ""
            key = f"{kind}:{effective_path or candidate}"
            if key in seen:
                return
            seen.add(key)
            items.append(
                {
                    "kind": kind,
                    "url": candidate,
                    "path": effective_path,
                    "label": Path(effective_path or candidate).name,
                }
            )

        for url in content_media_urls(content):
            add_item(url)
        for relative_path in content_relative_media_paths(content):
            if self._files.exists(media_project_dir, relative_path):
                add_item(
                    self._files.static_url(
                        project,
                        media_project_dir,
                        relative_path,
                    ),
                    relative_path,
                )
        return items

    def normalize(
        self,
        media: list[dict[str, Any]],
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
    ) -> list[dict[str, str]]:
        media_project_dir = self._files.resolve_project_dir(
            username,
            project,
            project_dir,
        )
        normalized: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in media:
            if not isinstance(item, dict):
                continue
            candidate = str(item.get("url", "") or "").strip()
            path = str(item.get("path", "") or "").strip()
            if not candidate and not path:
                continue
            if not candidate and path:
                canonical = self._canonical_static_media(
                    project,
                    media_project_dir,
                    path,
                )
                if canonical is None:
                    continue
                candidate, path = canonical

            candidate = normalize_media_source(candidate)
            if candidate.startswith("/static/"):
                canonical = self._canonical_static_media(
                    project,
                    media_project_dir,
                    candidate,
                )
                if canonical is None:
                    continue
                candidate, path = canonical
            kind = media_kind(candidate)
            if not kind:
                continue
            if not path:
                path = media_path_from_static_url(candidate) or ""
            key = f"{kind}:{path or candidate}"
            if key in seen:
                continue
            seen.add(key)
            normalized.append(
                {
                    "kind": kind,
                    "url": candidate,
                    "path": path,
                    "label": str(item.get("label", "") or Path(path or candidate).name),
                }
            )
        return normalized

    def _canonical_static_media(
        self,
        project: str,
        project_dir: Path,
        url_or_path: str,
    ) -> tuple[str, str] | None:
        media_path = canonical_media_path(url_or_path)
        if media_path is None:
            return None
        return (
            self._files.static_url(project, project_dir, media_path),
            media_path,
        )


__all__ = ["ProjectMedia"]

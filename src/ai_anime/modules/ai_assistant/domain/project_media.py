"""Pure project-chat media parsing and deduplication rules."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlparse

_MEDIA_EXTENSIONS = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".mov": "video",
    ".webm": "video",
    ".wav": "audio",
    ".mp3": "audio",
    ".m4a": "audio",
}
_URL_RE = re.compile(r"(https?://[^\s)>\"]+|/static/[^\s)>\"]+)")
_REL_PATH_RE = re.compile(
    r"(?P<path>(?:assets|videos|audio|images|frames|sketches|grids|uploads|scripts)/[^\s)>\"]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|wav|mp3|m4a))"
)
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def media_path_from_static_url(url: str) -> str | None:
    parsed = urlparse(url)
    path = parsed.path if parsed.scheme in {"http", "https"} else url.split("?", 1)[0]
    if not path.startswith("/static/"):
        return None
    relative = path[len("/static/") :]
    parts = relative.split("/", 2)
    if len(parts) == 3:
        return unquote(parts[2])
    return unquote(relative)


def canonical_media_path(url_or_path: str) -> str | None:
    media_path = media_path_from_static_url(url_or_path)
    if media_path is None:
        media_path = url_or_path.strip().split("?", 1)[0].lstrip("./")
    return media_path or None


def normalize_media_source(raw_url: str) -> str:
    candidate = raw_url.strip(".,;)]}")
    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
        return parsed.path
    return candidate


def media_kind(url: str) -> str | None:
    extension = Path(urlparse(url).path).suffix.lower()
    return _MEDIA_EXTENSIONS.get(extension)


def content_media_urls(content: str) -> list[str]:
    return [match.group(1) for match in _URL_RE.finditer(content)]


def content_relative_media_paths(content: str) -> list[str]:
    return [match.group("path") for match in _REL_PATH_RE.finditer(content)]


def markdown_image_refs(content: str) -> set[str]:
    refs: set[str] = set()
    for match in _MARKDOWN_IMAGE_RE.finditer(content):
        raw = (match.group(1) or "").strip().strip("<>").strip(".,;)]}")
        if not raw:
            continue
        refs.add(raw)
        parsed = urlparse(raw)
        path = (
            parsed.path if parsed.scheme in {"http", "https"} else raw.split("?", 1)[0]
        )
        if path:
            refs.add(path)
        static_path = media_path_from_static_url(raw)
        if static_path:
            refs.add(static_path)
            refs.add(static_path.lstrip("./"))
        elif parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/"):
            refs.add(parsed.path)
        elif raw.startswith("/static/"):
            refs.add(raw.split("?", 1)[0])
        else:
            refs.add(path.lstrip("./") if path else raw.lstrip("./"))
    return refs


def is_markdown_image_ref(
    url: str,
    path: str,
    refs: set[str],
) -> bool:
    return bool(
        url in refs or (path and path in refs) or (path and path.lstrip("./") in refs)
    )


def merge_project_media_items(
    *groups: list[dict[str, str]],
) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            kind = str(item.get("kind", "") or "").strip()
            url = str(item.get("url", "") or "").strip()
            path = str(item.get("path", "") or "").strip()
            if not kind or not url:
                continue
            key = f"{kind}:{path or url}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(
                {
                    "kind": kind,
                    "url": url,
                    "path": path,
                    "label": str(item.get("label", "") or Path(path or url).name),
                }
            )
    return merged


def filter_markdown_duplicate_media(
    content: str,
    media: list[dict[str, str]],
) -> list[dict[str, str]]:
    refs = markdown_image_refs(content)
    if not refs:
        return media

    filtered: list[dict[str, str]] = []
    for item in media:
        kind = str(item.get("kind", "") or "").strip()
        if kind != "image":
            filtered.append(item)
            continue
        url = str(item.get("url", "") or "").strip()
        path = str(item.get("path", "") or "").strip()
        if is_markdown_image_ref(url, path, refs):
            continue
        filtered.append(item)
    return filtered


__all__ = [
    "canonical_media_path",
    "content_media_urls",
    "content_relative_media_paths",
    "filter_markdown_duplicate_media",
    "is_markdown_image_ref",
    "markdown_image_refs",
    "media_kind",
    "media_path_from_static_url",
    "merge_project_media_items",
    "normalize_media_source",
]

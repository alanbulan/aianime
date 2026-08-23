"""HTTP adapter shared by API and static project file routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response

from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.platform_release.public import (
    ProjectDirectoryNotFound,
    ProjectFileAccessDenied,
    ProjectFileDelivery,
    ProjectFileNotFound,
    project_file_queries,
)
from ai_anime.shared.infrastructure.thumbnails import fresh_thumbnail, prewarm


# Project static files are addressed with content-versioned URLs (`v=<mtime_ns>`
# authored by canvas_static_urls, or `st_v=<committed_at>` from the renderer), so
# cached bodies are safe to reuse: rewritten files get a new URL. Explicit
# max-age lets remounted canvas <img> elements (onlyRenderVisibleElements) hit
# the local cache instead of revalidating every time, which removes blank-frame
# flicker while panning.
CACHEABLE_FILE_HEADERS = {"Cache-Control": "private, max-age=3600"}
_VERSION_PARAMS = ("st_v", "v")


def _variant_cache_control(request: Request | None) -> str:
    params = request.query_params if request is not None else {}
    if any(params.get(name) for name in _VERSION_PARAMS):
        return "private, max-age=31536000, immutable"
    return "private, no-cache"


def _etag_matches(request: Request | None, etag: str | None) -> bool:
    if request is None or not etag:
        return False
    header = request.headers.get("if-none-match")
    if not header:
        return False
    for candidate in header.split(","):
        value = candidate.strip()
        if value == "*":
            return True
        if value.startswith("W/"):
            value = value[2:]
        if value == etag:
            return True
    return False


def _thumbnail_response(
    *,
    project_dir: Path,
    source: Path,
    variant: str | None,
    request: Request | None,
) -> Response | None:
    if not variant:
        return None
    thumbnail = fresh_thumbnail(project_dir, source, variant)
    if thumbnail is None:
        prewarm(project_dir, source, [variant])
        return None
    cache_control = _variant_cache_control(request)
    try:
        stat_result = thumbnail.stat()
    except OSError:
        return None
    response = FileResponse(
        path=str(thumbnail),
        media_type="image/webp",
        stat_result=stat_result,
        headers={"Cache-Control": cache_control},
    )
    if _etag_matches(request, response.headers.get("etag")):
        return Response(
            status_code=304,
            headers={
                "Cache-Control": cache_control,
                "ETag": response.headers["etag"],
                "Last-Modified": response.headers["last-modified"],
            },
        )
    return response


def _response_for(
    delivery: ProjectFileDelivery,
    *,
    cache_control: str | None = None,
) -> Response:
    if delivery.redirect_url:
        return RedirectResponse(
            url=delivery.redirect_url,
            status_code=302,
            headers={"Cache-Control": "no-store"},
        )
    if delivery.download_name:
        return FileResponse(
            path=str(delivery.path),
            filename=delivery.download_name,
            headers=CACHEABLE_FILE_HEADERS,
        )
    return FileResponse(
        path=str(delivery.path),
        headers={"Cache-Control": cache_control}
        if cache_control
        else CACHEABLE_FILE_HEADERS,
    )


async def serve_project_file(
    *,
    project: str,
    file_path: str,
    user: dict,
    as_download: bool,
    request: Request | None = None,
    media_variant: str | None = None,
) -> Response:
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    try:
        delivery = project_file_queries().resolve(
            project_dir=resolved.project_dir,
            file_path=file_path,
            as_download=as_download,
        )
    except ProjectDirectoryNotFound as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ProjectFileAccessDenied as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    except ProjectFileNotFound as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    if not as_download:
        thumbnail = _thumbnail_response(
            project_dir=resolved.project_dir,
            source=delivery.path,
            variant=media_variant,
            request=request,
        )
        if thumbnail is not None:
            return thumbnail
    return _response_for(
        delivery,
        # A cold thumbnail request temporarily falls back to the original.
        # Do not cache that full-resolution body under the variant URL, or the
        # browser will keep decoding it after the background thumbnail is ready.
        cache_control="private, no-store" if media_variant else None,
    )

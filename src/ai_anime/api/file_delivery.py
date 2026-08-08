"""HTTP adapter shared by API and static project file routes."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response

from ai_anime.api.deps import resolve_project_scope
from ai_anime.modules.platform_release.public import (
    ProjectDirectoryNotFound,
    ProjectFileAccessDenied,
    ProjectFileDelivery,
    ProjectFileNotFound,
    project_file_queries,
)


def _response_for(delivery: ProjectFileDelivery) -> Response:
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
        )
    return FileResponse(path=str(delivery.path))


async def serve_project_file(
    *,
    project: str,
    file_path: str,
    user: dict,
    as_download: bool,
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
    return _response_for(delivery)

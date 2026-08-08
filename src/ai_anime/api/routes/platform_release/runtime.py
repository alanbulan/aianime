"""Health, desktop-control, media, and SPA routes outside the versioned API."""

from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.file_delivery import serve_project_file


class SpaStaticFiles(StaticFiles):
    """Serve index.html for extensionless client-side routes."""

    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and "." not in Path(path).name:
                return await super().get_response("index.html", scope)
            raise


def register_runtime_routes(application: FastAPI, *, desktop_mode: bool) -> None:
    @application.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    if not desktop_mode:
        return

    @application.post("/__desktop/shutdown", include_in_schema=False)
    async def desktop_shutdown(request: Request) -> dict[str, bool]:
        shutdown = getattr(request.app.state, "desktop_shutdown", None)
        if not callable(shutdown):
            return {"ok": False}
        shutdown()
        return {"ok": True}


def register_static_media_routes(application: FastAPI) -> None:
    @application.get(
        "/static/projects/{project}/{file_path:path}",
        include_in_schema=False,
    )
    async def static_project_media(
        project: str,
        file_path: str,
        user: dict = Depends(get_api_user),
    ):
        return await serve_project_file(
            project=project,
            file_path=file_path,
            user=user,
            as_download=False,
        )

    @application.get("/static/{legacy_path:path}", include_in_schema=False)
    async def legacy_static_media(legacy_path: str):
        _ = legacy_path
        return PlainTextResponse(
            "legacy static path; use /static/projects/<project_id>/...\n",
            status_code=410,
        )


def mount_frontend(application: FastAPI, frontend_dist: str) -> None:
    if not frontend_dist or not Path(frontend_dist).is_dir():
        return
    application.mount(
        "/",
        SpaStaticFiles(directory=frontend_dist, html=True),
        name="spa",
    )

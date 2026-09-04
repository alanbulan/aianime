from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


def test_desktop_app_requires_session_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
    from ai_anime.api.app import create_app

    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.delenv("AI_ANIME_DESKTOP_TOKEN", raising=False)

    with pytest.raises(RuntimeError, match="AI_ANIME_DESKTOP_TOKEN"):
        create_app()


def test_desktop_middleware_and_shutdown_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "desktop-test-token")

    from ai_anime.api.app import create_app

    application = create_app()
    shutdown_calls: list[bool] = []
    application.state.desktop_shutdown = lambda: shutdown_calls.append(True)
    client = TestClient(application)

    rejected = client.get("/healthz")
    assert rejected.status_code == 401
    assert rejected.json() == {
        "ok": False,
        "error": "desktop session rejected",
    }

    headers = {"X-AI-Anime-Desktop-Token": "desktop-test-token"}
    assert client.get("/healthz", headers=headers).json() == {"status": "ok"}
    assert client.post("/__desktop/shutdown", headers=headers).json() == {"ok": True}
    assert shutdown_calls == [True]


def test_desktop_serves_only_installed_matte_runtime_assets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    runtime_root = tmp_path / "matte" / "current"
    config_path = runtime_root / "models" / "Xenova" / "modnet" / "config.json"
    config_path.parent.mkdir(parents=True)
    config_path.write_text('{"model_type":"modnet"}', encoding="utf-8")
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "desktop-test-token")
    monkeypatch.setenv("AI_ANIME_MATTE_RUNTIME_ROOT", str(runtime_root))

    from ai_anime.api.app import create_app

    client = TestClient(create_app())
    headers = {"X-AI-Anime-Desktop-Token": "desktop-test-token"}
    response = client.get(
        "/api/v1/runtime-dependencies/matte/models/Xenova/modnet/config.json",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"model_type": "modnet"}
    assert response.headers["content-type"].startswith("application/json")
    assert (
        client.get(
            "/api/v1/runtime-dependencies/matte/models/unlisted.json",
            headers=headers,
        ).status_code
        == 404
    )


def test_project_workspace_errors_keep_http_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)

    from ai_anime.api.app import create_app
    from ai_anime.modules.project_workspace.public import (
        InvalidProjectName,
        ProjectAlreadyExists,
        ProjectBackendNotInitialized,
        ProjectHomeNodeRequired,
        ProjectLifecycleConflict,
        ProjectNotFound,
        ProjectRoleRequired,
        ProjectUserIdentityUnresolved,
    )

    application = create_app()
    cases = {
        "backend": (
            ProjectBackendNotInitialized(),
            503,
            "project backend not initialised",
        ),
        "missing": (ProjectNotFound(), 404, "Project not found"),
        "identity": (
            ProjectUserIdentityUnresolved(),
            401,
            "Unable to resolve user id",
        ),
        "role": (
            ProjectRoleRequired("editor", "viewer"),
            403,
            "project role required: editor",
        ),
        "home": (
            ProjectHomeNodeRequired(
                project_id="proj_123",
                home_node_id="node_a",
                operation="read project files",
            ),
            409,
            {
                "code": "project_not_on_this_node",
                "message": "read project files must run on the project home node",
                "project_id": "proj_123",
                "home_node_id": "node_a",
            },
        ),
        "invalid-name": (
            InvalidProjectName("invalid project name"),
            400,
            "invalid project name",
        ),
        "duplicate": (
            ProjectAlreadyExists("agent"),
            409,
            "Project 'agent' already exists",
        ),
        "lifecycle": (
            ProjectLifecycleConflict("invalid project state"),
            400,
            "invalid project state",
        ),
    }

    def endpoint(error: Exception):
        async def raise_error() -> None:
            raise error

        return raise_error

    for name, (error, _status, _detail) in cases.items():
        application.add_api_route(f"/_test/project-error/{name}", endpoint(error))

    client = TestClient(application)
    for name, (_error, status, detail) in cases.items():
        response = client.get(f"/_test/project-error/{name}")
        assert response.status_code == status
        assert response.json() == {"detail": detail}


def test_desktop_auth_routes_are_composed_only_in_desktop_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api.app import create_app

    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
    monkeypatch.delenv("AI_ANIME_DESKTOP_TOKEN", raising=False)
    browser_paths = set(create_app().openapi()["paths"])

    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setenv("AI_ANIME_DESKTOP_TOKEN", "desktop-test-token")
    desktop_paths = set(create_app().openapi()["paths"])

    assert "/api/v1/auth/login" not in browser_paths
    assert "/api/v1/auth/authorize" not in browser_paths
    assert "/api/v1/auth/login" in desktop_paths
    assert "/api/v1/auth/authorize" in desktop_paths


@pytest.mark.asyncio
async def test_app_lifespan_orders_startup_and_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api import lifespan as lifespan_module
    from ai_anime.shared.infrastructure import sqlite_pragmas

    events: list[str] = []

    class Lifecycle:
        async def on_startup(self, *, register_as_worker: bool = True) -> None:
            assert register_as_worker is True
            events.append("startup")

        async def on_shutdown(self) -> None:
            events.append("shutdown")

    application = FastAPI()
    application.state.container = SimpleNamespace(lifecycle=Lifecycle())
    monkeypatch.setattr(sqlite_pragmas, "litestream_enabled", lambda: False)

    async with lifespan_module.app_lifespan(application):
        events.append("serving")

    assert events == ["startup", "serving", "shutdown"]


@pytest.mark.asyncio
async def test_shutdown_cancels_desktop_knowledge_graph_warmup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ai_anime.api import lifespan as lifespan_module
    from ai_anime.migrations import model_usage as model_usage_migrations
    from ai_anime.shared.infrastructure import project_stores, sqlite_pragmas

    started = asyncio.Event()
    shutdown_calls: list[bool] = []

    async def prewarm() -> None:
        started.set()
        await asyncio.Event().wait()

    class Lifecycle:
        async def on_startup(self, *, register_as_worker: bool = True) -> None:
            assert register_as_worker is True

        async def on_shutdown(self) -> None:
            shutdown_calls.append(True)

    application = FastAPI()
    application.state.container = SimpleNamespace(lifecycle=Lifecycle())
    monkeypatch.setenv("AI_ANIME_DESKTOP_MODE", "1")
    monkeypatch.setattr(
        model_usage_migrations, "purge_retired_gateway_settings", lambda: None
    )
    monkeypatch.setattr(project_stores, "prewarm_knowledge_graph_runtime", prewarm)
    monkeypatch.setattr(sqlite_pragmas, "litestream_enabled", lambda: False)

    await lifespan_module.startup_application(application)
    await asyncio.wait_for(started.wait(), timeout=1)
    warmup_task = application.state.knowledge_graph_runtime_warmup

    await lifespan_module.shutdown_application(application)

    assert warmup_task.cancelled()
    assert application.state.knowledge_graph_runtime_warmup is None
    assert shutdown_calls == [True]

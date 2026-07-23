from __future__ import annotations

import importlib
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_anime.ports.auth_contract import AuthError, AuthFailureReason

pytestmark = pytest.mark.m01


@asynccontextmanager
async def _disabled_lifespan(application: FastAPI) -> AsyncIterator[None]:
    _ = application
    yield


def _reset_port_modules():
    import ai_anime.ports as ports
    import ai_anime.ports.local as local_ports
    import ai_anime.ports.registry as registry

    registry = importlib.reload(registry)
    ports = importlib.reload(ports)
    local_ports = importlib.reload(local_ports)
    return registry, ports, local_ports


def _patch_roots(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    output = tmp_path / "output"
    state = tmp_path / "state"
    runtime = tmp_path / "runtime"

    import ai_anime.api.deps as deps
    import ai_anime.config as config
    import ai_anime.project_config as project_config
    import ai_anime.utils.project_paths as project_paths

    for module in (config, deps, project_paths):
        monkeypatch.setattr(module, "OUTPUT_DIR", str(output), raising=False)
        monkeypatch.setattr(module, "STATE_DIR", str(state), raising=False)
        monkeypatch.setattr(module, "RUNTIME_DIR", str(runtime), raising=False)
    monkeypatch.setattr(project_config, "OUTPUT_DIR", str(state), raising=False)
    monkeypatch.setattr(project_config, "STATE_DIR", str(state), raising=False)


class _RejectingAuthPort:
    async def verify_session(self, raw_cookie: str | None) -> dict:
        if raw_cookie is None:
            raise AuthError(AuthFailureReason.MISSING, "Missing session or agent token")
        raise AuthError(AuthFailureReason.INVALID, "Invalid session")

    async def revoke_session(self, raw_cookie: str) -> None:  # noqa: ARG002
        return None


def _ce_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    registry, _, _ = _reset_port_modules()
    monkeypatch.setenv("AI_ANIME_CONTROL_PLANE_DSN", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.setenv("AI_ANIME_LOCAL_USERNAME", "local")
    for module_name in list(sys.modules):
        if module_name == "ai_anime.api" or module_name.startswith("ai_anime.api."):
            sys.modules.pop(module_name)
    _patch_roots(monkeypatch, tmp_path)

    registry.ensure_bootstrap()

    from ai_anime.api.app import create_app

    app = create_app()
    app.router.lifespan_context = _disabled_lifespan
    return TestClient(app)


def test_ce_auth_me_logout_and_project_crud_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with _ce_client(monkeypatch, tmp_path) as client:
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json() == {
            "ok": True,
            "data": {
                "username": "local",
                "role": "owner",
                "credit_balance": 0,
                "credential_kind": "user",
                "current_scope_kind": None,
                "current_project_id": None,
                "scopes": None,
            },
        }

        logout = client.post("/api/v1/auth/logout")
        assert logout.status_code == 200
        assert logout.json() == {"ok": True}
        assert "ai_anime_session=" in logout.headers["set-cookie"]
        assert "Max-Age=0" in logout.headers["set-cookie"]

        login = client.post("/api/v1/auth/login", json={"username": "local", "password": "x"})
        assert login.status_code == 404

        openapi = client.get("/openapi.json")
        assert openapi.status_code == 200
        assert "/api/v1/auth/login" not in openapi.json()["paths"]

        created = client.post("/api/v1/projects", json={"name": "demo"})
        assert created.status_code == 200
        project_id = created.json()["data"]["project_id"]

        listed = client.get("/api/v1/projects")
        assert listed.status_code == 200
        assert listed.json()["data"][0]["id"] == project_id

        detail = client.get(f"/api/v1/projects/{project_id}")
        assert detail.status_code == 200
        assert detail.json()["data"]["project_id"] == project_id


@pytest.mark.ee
def test_ee_auth_missing_and_bad_cookie_contract() -> None:
    registry, _, _ = _reset_port_modules()
    registry.register_port("auth", _RejectingAuthPort())

    from ai_anime.api.app import create_app

    app = create_app()
    app.router.lifespan_context = _disabled_lifespan

    with TestClient(app) as client:
        missing = client.get("/api/v1/auth/me")
        assert missing.status_code == 401
        assert missing.json()["detail"] == "Missing session or agent token"

        bad = client.get("/api/v1/auth/me", cookies={"ai_anime_session": "bad-cookie"})
        assert bad.status_code == 401
        assert bad.json()["detail"] == "Invalid session"

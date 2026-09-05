from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_runtime_config_includes_stable_instance_id(monkeypatch) -> None:
    from ai_anime.api.routes.platform_release import runtime_config as config
    from ai_anime.shared import runtime_env

    monkeypatch.setattr(runtime_env, "load_project_dotenv", lambda override=False: None)
    monkeypatch.setenv("AI_ANIME_EDITION", "ce")
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)

    app = FastAPI()
    app.include_router(config.router, prefix="/api/v1")
    client = TestClient(app)

    first = client.get("/api/v1/config")
    second = client.get("/api/v1/config")

    assert first.status_code == 200
    assert second.status_code == 200
    first_data = first.json()["data"]
    second_data = second.json()["data"]

    assert first_data["edition"] == "ce"
    assert first_data["auth_required"] is False
    assert isinstance(first_data["instance_id"], str)
    assert first_data["instance_id"]
    assert second_data["instance_id"] == first_data["instance_id"]


_SHARING_OPERATIONS = [
    ("GET", "/projects/{project}/grants"),
    ("GET", "/users/search"),
    ("POST", "/projects/{project}/grants"),
    ("PATCH", "/projects/{project}/grants/{grantId}"),
    ("DELETE", "/projects/{project}/grants/{grantId}"),
]


@pytest.mark.parametrize("edition", ["ce", "ee", ""])
@pytest.mark.parametrize("missing_index", [None, *range(len(_SHARING_OPERATIONS))])
def test_sharing_requires_every_registered_route(monkeypatch, edition, missing_index):
    from ai_anime.api.routes.platform_release import runtime_config as config
    from ai_anime.shared import runtime_env

    monkeypatch.setattr(runtime_env, "load_project_dotenv", lambda override=False: None)
    monkeypatch.setenv("AI_ANIME_EDITION", edition)
    monkeypatch.delenv("AI_ANIME_CONTROL_PLANE_DSN", raising=False)
    app = FastAPI()
    app.include_router(config.router, prefix="/api/v1")

    async def sharing_endpoint():
        raise AssertionError("capability discovery must not call sharing endpoints")

    for index, (method, path) in enumerate(_SHARING_OPERATIONS):
        if index != missing_index:
            app.add_api_route(f"/api/v1{path}", sharing_endpoint, methods=[method])

    response = TestClient(app).get("/api/v1/config")

    assert response.status_code == 200
    assert response.json()["data"]["project_sharing_enabled"] is (
        edition != "ce" and missing_index is None
    )


def test_core_ee_runtime_does_not_advertise_unavailable_sharing(monkeypatch):
    from ai_anime.api.app import create_app
    from ai_anime.api.v1 import router
    from ai_anime.shared import runtime_env

    monkeypatch.setattr(runtime_env, "load_project_dotenv", lambda override=False: None)
    monkeypatch.setenv("AI_ANIME_EDITION", "ee")
    monkeypatch.delenv("AI_ANIME_DESKTOP_MODE", raising=False)
    monkeypatch.setattr(router, "entry_points", lambda **_kwargs: [])

    response = TestClient(create_app()).get("/api/v1/config")

    assert response.status_code == 200
    assert response.json()["data"]["edition"] == "ee"
    assert response.json()["data"]["project_sharing_enabled"] is False

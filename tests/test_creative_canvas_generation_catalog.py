from __future__ import annotations

from typing import Any

import pytest

from ai_anime.api.routes.canvas import image as image_routes
from ai_anime.api.routes.canvas import video as video_routes
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)


class FakeGenerationCatalogSource:
    def __init__(self) -> None:
        self.camera_options = {"bodies": [{"id": "body-1"}]}
        self.style_templates = [{"id": "style-1"}]
        self.image_model_options = [{"id": "image-1"}]
        self.camera_templates = [{"id": "camera-1"}]
        self.video_model_options = [{"id": "video-1"}]

    def image_camera_options(self) -> dict[str, Any]:
        return self.camera_options

    def image_style_templates(self) -> list[dict[str, Any]]:
        return self.style_templates

    def image_models(self) -> list[dict[str, Any]]:
        return self.image_model_options

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return self.camera_templates

    def video_models(self) -> list[dict[str, Any]]:
        return self.video_model_options


def test_generation_catalog_queries_return_detached_payloads() -> None:
    source = FakeGenerationCatalogSource()
    queries = GenerationCatalogQueries(source)

    camera_options = queries.image_camera_options()
    style_templates = queries.image_style_templates()
    image_models = queries.image_models()
    camera_templates = queries.video_camera_templates()
    video_models = queries.video_models()

    camera_options["bodies"][0]["id"] = "changed"
    style_templates[0]["id"] = "changed"
    image_models[0]["id"] = "changed"
    camera_templates[0]["id"] = "changed"
    video_models[0]["id"] = "changed"

    assert source.camera_options["bodies"][0]["id"] == "body-1"
    assert source.style_templates[0]["id"] == "style-1"
    assert source.image_model_options[0]["id"] == "image-1"
    assert source.camera_templates[0]["id"] == "camera-1"
    assert source.video_model_options[0]["id"] == "video-1"


def test_generation_catalog_subrouters_own_only_catalog_paths() -> None:
    paths = {
        route.path
        for route in [*image_routes.router.routes, *video_routes.router.routes]
    }

    assert paths == {
        "/projects/{project}/freezone/image/camera-options",
        "/projects/{project}/freezone/image/style-templates",
        "/projects/{project}/freezone/image/models",
        "/projects/{project}/freezone/video/camera-templates",
        "/projects/{project}/freezone/video/models",
    }


@pytest.mark.asyncio
async def test_video_models_route_uses_viewer_scope_and_catalog_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved: list[tuple[str, dict, str, str]] = []

    async def fake_resolve_project_scope(
        project: str,
        user: dict,
        *,
        required_role: str,
        operation: str,
    ) -> object:
        resolved.append((project, user, required_role, operation))
        return object()

    class FakeQueries:
        def video_models(self) -> list[dict[str, str]]:
            return [{"id": "video-1"}]

    monkeypatch.setattr(
        video_routes, "resolve_project_scope", fake_resolve_project_scope
    )
    monkeypatch.setattr(video_routes, "generation_catalog_queries", FakeQueries)

    user = {"username": "admin"}
    result = await video_routes.freezone_video_models(project="project-1", user=user)

    assert resolved == [("project-1", user, "viewer", "access freezone project files")]
    assert result == {"ok": True, "data": [{"id": "video-1"}]}

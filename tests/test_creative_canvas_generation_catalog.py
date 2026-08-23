from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from ai_anime.api.routes.creative_canvas import image as image_routes
from ai_anime.api.routes.creative_canvas import video as video_routes
from ai_anime.modules.creative_canvas.application.generation_catalog import (
    GenerationCatalogQueries,
)
from ai_anime.modules.creative_canvas.infrastructure.generation_catalog import (
    ConfiguredGenerationCatalogSource,
)


class FakeGenerationCatalogSource:
    def __init__(self) -> None:
        self.camera_options = {"bodies": [{"id": "body-1"}]}
        self.style_templates = [{"id": "style-1"}]
        self.camera_templates = [{"id": "camera-1"}]

    def image_camera_options(self) -> dict[str, Any]:
        return self.camera_options

    def image_style_templates(self) -> list[dict[str, Any]]:
        return self.style_templates

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return self.camera_templates


def test_generation_catalog_queries_return_detached_payloads() -> None:
    source = FakeGenerationCatalogSource()
    queries = GenerationCatalogQueries(source)

    camera_options = queries.image_camera_options()
    style_templates = queries.image_style_templates()
    camera_templates = queries.video_camera_templates()

    camera_options["bodies"][0]["id"] = "changed"
    style_templates[0]["id"] = "changed"
    camera_templates[0]["id"] = "changed"

    assert source.camera_options["bodies"][0]["id"] == "body-1"
    assert source.style_templates[0]["id"] == "style-1"
    assert source.camera_templates[0]["id"] == "camera-1"


def test_style_catalog_uses_complete_bundled_gallery_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("STYLE_GALLERY_ASSET_BASE", raising=False)

    templates = ConfiguredGenerationCatalogSource().image_style_templates()
    asset_urls = [
        url
        for template in templates
        for url in [template["cover_url"], *template["sample_urls"]]
    ]
    frontend_public = Path(__file__).resolve().parents[1] / "frontend" / "public"

    assert len(templates) == 45
    assert len(asset_urls) == 225
    assert all(url.startswith("/style-gallery/") for url in asset_urls)
    assert all((frontend_public / url.lstrip("/")).is_file() for url in asset_urls)


def test_style_catalog_keeps_configured_asset_base_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "STYLE_GALLERY_ASSET_BASE",
        "https://assets.example.com/styles/",
    )

    templates = ConfiguredGenerationCatalogSource().image_style_templates()

    assert templates[0]["cover_url"].startswith(
        "https://assets.example.com/styles/"
    )
    assert all(
        url.startswith("https://assets.example.com/styles/")
        for url in templates[0]["sample_urls"]
    )


def test_generation_catalog_subrouters_include_catalog_paths() -> None:
    paths = {
        route.path
        for route in [*image_routes.router.routes, *video_routes.router.routes]
    }

    assert {
        "/projects/{project}/freezone/image/camera-options",
        "/projects/{project}/freezone/image/style-templates",
        "/projects/{project}/freezone/video/camera-templates",
    } <= paths
    assert "/projects/{project}/freezone/image/models" not in paths
    assert "/projects/{project}/freezone/video/models" not in paths


@pytest.mark.asyncio
async def test_video_camera_templates_route_uses_viewer_scope_and_catalog_query(
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
        def video_camera_templates(self) -> list[dict[str, str]]:
            return [{"id": "camera-1"}]

    monkeypatch.setattr(
        video_routes, "resolve_project_scope", fake_resolve_project_scope
    )
    monkeypatch.setattr(video_routes, "generation_catalog_queries", FakeQueries)

    user = {"username": "admin"}
    result = await video_routes.freezone_video_camera_templates(
        project="project-1", user=user
    )

    assert resolved == [("project-1", user, "viewer", "access freezone project files")]
    assert result == {"ok": True, "data": [{"id": "camera-1"}]}

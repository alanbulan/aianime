from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    CreateCustomStyleCommand,
    StyleAnalysisBilling,
    StyleScope,
)
from ai_anime.modules.asset_world.application.errors import (
    StyleRejected,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.styles import (
    AnalyzeStyle,
    StyleCatalogUseCases,
    StylePreviewUseCases,
)
from ai_anime.modules.asset_world.application.style_models import StyleConfig


class _Catalog:
    def __init__(self) -> None:
        self.presets: set[str] = set()
        self.styles: dict[str, object] = {}
        self.saved: list[tuple[str, object, dict]] = []
        self.staged: list[tuple[bytes, str]] = []

    def list_all_styles(self, **_):
        return [
            {
                "id": "custom_style",
                "name": "Custom",
                "type": "custom",
                "preview_path": "assets/styles/custom_style/reference.png",
            }
        ]

    def get_style(self, style_id, **_):
        return self.styles.get(style_id)

    def get_preset(self, style_id):
        return object() if style_id in self.presets else None

    def build_style_config(self, payload):
        return SimpleNamespace(**payload, preview_path=None)

    def validate_style_preview_path(self, _project_dir, _style_id, preview_path):
        return preview_path

    def find_style_preview(self, _project_dir, _style_id):
        return None

    def save_custom_style(self, style_id, config, **kwargs):
        self.saved.append((style_id, config, kwargs))
        return True

    def delete_custom_style(self, style_id, **_):
        return self.styles.pop(style_id, None) is not None

    def stage_style_preview(self, _project_dir, content, extension):
        self.staged.append((content, extension))
        return f"assets/styles/.staging/upload{extension}"

    def finalize_style_preview(self, _project_dir, style_id, staged_path):
        return f"assets/styles/{style_id}/reference{Path(staged_path).suffix}"

    def preset_preview_path(self, style_id):
        return Path(f"{style_id}.png")

    def resolve_project_preview_path(self, project_dir, preview_path):
        candidate = Path(project_dir) / preview_path
        return candidate if candidate.exists() else None


class _UsageMeter:
    def __init__(self) -> None:
        self.contexts: list[tuple[str, dict]] = []
        self.clear_count = 0

    def set_llm_usage_context(self, user_id, **kwargs):
        self.contexts.append((user_id, kwargs))

    def clear_llm_usage_context(self):
        self.clear_count += 1


def test_style_config_preserves_legacy_runtime_shape() -> None:
    config = StyleConfig.from_legacy_dict(
        "film",
        {
            "style_instructions": "cinematic",
            "avoid_instructions": "flat",
            "style_tag": "FILM",
            "style_family": "live_action",
        },
        "Film",
    )

    assert config.is_preset is True
    assert config.to_legacy_dict() == {
        "style_instructions": "cinematic",
        "avoid_instructions": "flat",
        "style_family": "live_action",
        "animation_subtype": "",
        "label": "Film",
        "style_tag": "FILM",
    }


def test_style_catalog_projects_custom_preview_urls() -> None:
    use_cases = StyleCatalogUseCases(_Catalog())
    scope = StyleScope(
        username="alice",
        project_name="internal-name",
        request_project="project name",
    )

    styles = use_cases.list_styles(scope)

    assert styles[0]["preview_url"] == (
        "/api/v1/projects/project%20name/media/"
        "assets/styles/custom_style/reference.png"
    )


def test_create_custom_style_rejects_presets_and_saves_project_style(tmp_path) -> None:
    catalog = _Catalog()
    catalog.presets.add("preset")
    use_cases = StyleCatalogUseCases(catalog)
    scope = StyleScope(
        username="alice",
        project_name="demo",
        project_dir=tmp_path,
    )

    with pytest.raises(StyleRejected, match="Cannot override preset style 'preset'"):
        use_cases.create_custom_style(
            CreateCustomStyleCommand("preset", "Preset", {}),
            scope,
        )

    use_cases.create_custom_style(
        CreateCustomStyleCommand(
            "custom_style",
            "Custom",
            {"style_instructions": "cinematic"},
        ),
        scope,
    )

    style_id, config, context = catalog.saved[0]
    assert style_id == "custom_style"
    assert config.name == "Custom"
    assert context == {"username": "alice", "project": "demo"}


def test_upload_style_preview_validates_media_before_persisting(tmp_path) -> None:
    catalog = _Catalog()
    use_cases = StyleCatalogUseCases(catalog)
    scope = StyleScope(username="alice", project_dir=tmp_path)

    with pytest.raises(UnsupportedStyleMedia):
        use_cases.upload_style_preview(
            scope=scope,
            style_id="custom_style",
            content=b"image",
            filename="reference.avif",
            content_type="image/avif",
        )

    preview_path = use_cases.upload_style_preview(
        scope=scope,
        style_id="custom_style",
        content=b"image",
        filename="reference.PNG",
        content_type="image/png",
    )

    assert catalog.staged == [(b"image", ".png")]
    assert preview_path == "assets/styles/custom_style/reference.png"


@pytest.mark.asyncio
async def test_style_analysis_stages_preview_and_scopes_usage(tmp_path) -> None:
    catalog = _Catalog()
    usage = _UsageMeter()

    class Analyzer:
        async def analyze(self, content, *, mime_type):
            return {"bytes": len(content), "mime_type": mime_type}

    command = AnalyzeStyleCommand(
        content=b"image",
        mime_type="image/png",
        filename="reference.png",
        style_id="custom_style",
        billing=StyleAnalysisBilling(
            billing_user_id="user-1",
            project_id="project-1",
            requester_user_id="user-1",
            project_owner_id="owner-1",
        ),
    )

    data = await AnalyzeStyle(catalog, Analyzer(), usage).execute(
        command,
        StyleScope(username="alice", project_dir=tmp_path),
    )

    assert data["preview_token"].endswith("upload.png")
    assert usage.contexts[0][0] == "user-1"
    assert usage.contexts[0][1]["billing_metadata"]["source"] == "style_analyzer"
    assert usage.clear_count == 1


@pytest.mark.asyncio
async def test_style_preview_generation_returns_application_file(tmp_path) -> None:
    catalog = _Catalog()
    catalog.styles["custom_style"] = object()
    preview = tmp_path / "preview.png"

    class Generator:
        async def generate(self, **_):
            return [preview]

    result = await StylePreviewUseCases(catalog, Generator()).generate_preview(
        style_id="custom_style",
        scope=StyleScope(username="alice"),
        prompt="portrait",
        model="image-platform-sku",
    )

    assert result.path == preview
    assert result.media_type == "image/png"
    assert result.filename == "preview_custom_style.png"

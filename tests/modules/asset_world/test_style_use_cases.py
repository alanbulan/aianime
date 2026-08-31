from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import (
    AnalyzeStyleCommand,
    AssetTaskQueueReceipt,
    CreateCustomStyleCommand,
    StyleScope,
    UpdateCustomStyleCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidStyleInput,
    StyleAlreadyExists,
    StyleRejected,
    UnsupportedStyleMedia,
)
from ai_anime.modules.asset_world.application.styles import (
    AnalyzeStyle,
    StyleCatalogUseCases,
    StylePreviewTaskUseCases,
    StylePreviewUseCases,
)
from ai_anime.modules.asset_world.application.style_models import StyleConfig


class _Catalog:
    def __init__(self, root: Path | None = None) -> None:
        self.presets: set[str] = set()
        self.styles: dict[str, object] = {}
        self.saved: list[tuple[str, object, dict]] = []
        self.staged: list[tuple[bytes, str]] = []
        self.root = root

    def list_all_styles(self, **_):
        return [
            {
                "id": "custom_style",
                "name": "Custom",
                "type": "custom",
                "preview_path": "styles/custom_style/reference.png",
            }
        ]

    def get_style(self, style_id, **_):
        return self.styles.get(style_id)

    def get_preset(self, style_id):
        return object() if style_id in self.presets else None

    def build_style_config(self, payload):
        normalized = dict(payload)
        normalized.setdefault("preview_path", None)
        return SimpleNamespace(**normalized)

    def validate_style_preview_path(self, _username, _style_id, preview_path):
        return preview_path

    def find_style_preview(self, _username, _style_id):
        return None

    def save_custom_style(self, style_id, config, **kwargs):
        self.saved.append((style_id, config, kwargs))
        return True

    def update_custom_style_preview(self, style_id, preview_path, **kwargs):
        style = self.styles.get(style_id)
        if style is None:
            return False
        payload = vars(style).copy()
        payload["preview_path"] = preview_path
        config = self.build_style_config(payload)
        self.saved.append((style_id, config, kwargs))
        return True

    def delete_custom_style(self, style_id, **_):
        return self.styles.pop(style_id, None) is not None

    def stage_style_preview(self, username, content, extension):
        assert self.root is not None
        self.staged.append((content, extension))
        account_root = self.root / username / "_account"
        staged = account_root / "styles/.staging" / f"upload{extension}"
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(content)
        return staged.relative_to(account_root).as_posix()

    def finalize_style_preview(self, username, style_id, staged_path):
        assert self.root is not None
        account_root = self.root / username / "_account"
        relative = f"styles/{style_id}/reference{Path(staged_path).suffix}"
        source = account_root / staged_path
        target = account_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        return relative

    def preset_preview_path(self, style_id):
        return Path(f"{style_id}.png")

    def resolve_style_preview_path(self, username, preview_path):
        assert self.root is not None
        candidate = self.root / username / "_account" / preview_path
        return candidate if candidate.exists() else None


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


def test_style_catalog_projects_global_custom_preview_urls() -> None:
    use_cases = StyleCatalogUseCases(_Catalog())
    scope = StyleScope(
        username="alice",
        project_name="internal-name",
        request_project="project name",
    )

    styles = use_cases.list_styles(scope)

    assert styles[0]["preview_url"] == "/api/v1/styles/custom_style/preview"


def test_create_custom_style_rejects_presets_and_saves_account_style(tmp_path) -> None:
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
    assert context == {"username": "alice"}


def test_create_custom_style_generates_internal_id_when_omitted(tmp_path) -> None:
    catalog = _Catalog()
    use_cases = StyleCatalogUseCases(catalog)

    style_id = use_cases.create_custom_style(
        CreateCustomStyleCommand("", "日系二次元", {"label": "日系二次元"}),
        StyleScope(username="alice", project_name="demo", project_dir=tmp_path),
    )

    assert style_id.startswith("custom_")
    assert catalog.saved[0][0] == style_id
    assert catalog.saved[0][1].name == "日系二次元"


def test_create_custom_style_rejects_existing_id_without_writing(tmp_path) -> None:
    catalog = _Catalog()
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="原风格",
        label="原风格标签",
        base="anime",
        style_instructions="保留的正向指令",
        avoid_instructions="保留的反向指令",
        style_tag="ORIGINAL",
        style_family="animation",
        animation_subtype="2d",
        preview_path=None,
        is_preset=False,
    )

    with pytest.raises(StyleAlreadyExists, match="already exists"):
        StyleCatalogUseCases(catalog).create_custom_style(
            CreateCustomStyleCommand("custom_style", "", {}),
            StyleScope(username="alice", project_name="demo", project_dir=tmp_path),
        )

    assert catalog.saved == []


def test_update_custom_style_preserves_reference_and_creation_metadata(tmp_path) -> None:
    catalog = _Catalog()
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="原风格",
        label="原风格标签",
        base="anime",
        style_instructions="原指令",
        avoid_instructions="原反向指令",
        style_tag="ORIGINAL",
        style_family="animation",
        animation_subtype="2d",
        preview_path="styles/custom_style/reference.png",
        created_at="2026-08-15T12:00:00",
        created_by="alice",
        is_preset=False,
    )

    style_id = StyleCatalogUseCases(catalog).update_custom_style(
        UpdateCustomStyleCommand(
            style_id="custom_style",
            name="新风格",
            config={
                "label": "新标签",
                "style_instructions": "新指令",
                "avoid_instructions": "新反向指令",
                "style_tag": "UPDATED",
                "style_family": "animation",
                "animation_subtype": "2d",
            },
        ),
        StyleScope(username="alice", project_dir=tmp_path),
    )

    assert style_id == "custom_style"
    _, saved, context = catalog.saved[0]
    assert saved.name == "新风格"
    assert saved.style_instructions == "新指令"
    assert saved.preview_path == "styles/custom_style/reference.png"
    assert saved.created_at == "2026-08-15T12:00:00"
    assert saved.created_by == "alice"
    assert context == {"username": "alice"}


def test_style_service_preview_update_changes_only_preview_path(monkeypatch, tmp_path) -> None:
    from ai_anime.modules.asset_world.infrastructure import style_catalog

    monkeypatch.setattr(style_catalog, "STATE_DIR", str(tmp_path / "state"))
    config = StyleConfig(
        id="custom_style",
        name="原风格",
        style_instructions="必须保留",
        avoid_instructions="同样保留",
    )
    assert style_catalog.StyleService.save_custom_style(
        "custom_style", config, username="alice"
    )

    assert style_catalog.StyleService.update_custom_style_preview(
        "custom_style",
        "styles/custom_style/reference.png",
        username="alice",
    )
    updated = style_catalog.StyleService.get_custom_style(
        "custom_style", username="alice"
    )
    assert updated is not None
    assert updated.name == "原风格"
    assert updated.style_instructions == "必须保留"
    assert updated.avoid_instructions == "同样保留"
    assert updated.preview_path == "styles/custom_style/reference.png"


@pytest.mark.parametrize("style_id", ["../escape", "nested/style", "nested\\style"])
def test_create_custom_style_rejects_path_like_ids(style_id: str, tmp_path) -> None:
    with pytest.raises(InvalidStyleInput, match="风格 ID"):
        StyleCatalogUseCases(_Catalog()).create_custom_style(
            CreateCustomStyleCommand(style_id, "Invalid", {}),
            StyleScope(username="alice", project_name="demo", project_dir=tmp_path),
        )


def test_upload_style_preview_validates_media_before_persisting(tmp_path) -> None:
    catalog = _Catalog(tmp_path)
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
    assert preview_path == "styles/custom_style/reference.png"


@pytest.mark.asyncio
async def test_style_analysis_stages_preview(tmp_path) -> None:
    catalog = _Catalog(tmp_path)

    class Analyzer:
        async def analyze(self, content, *, mime_type):
            return {"bytes": len(content), "mime_type": mime_type}

    command = AnalyzeStyleCommand(
        content=b"image",
        mime_type="image/png",
        filename="reference.png",
        style_id="custom_style",
    )

    data = await AnalyzeStyle(catalog, Analyzer()).execute(
        command,
        StyleScope(username="alice", project_dir=tmp_path),
    )

    assert data["preview_token"].endswith("upload.png")


@pytest.mark.asyncio
async def test_style_preview_generation_returns_application_file(tmp_path) -> None:
    catalog = _Catalog(tmp_path)
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="Custom",
        style_instructions="生成前配置",
        preview_path=None,
    )
    preview = tmp_path / "preview.png"
    preview.write_bytes(b"generated-image")

    class Generator:
        async def generate(self, **kwargs):
            assert kwargs["project_dir"] == tmp_path
            catalog.styles["custom_style"] = SimpleNamespace(
                id="custom_style",
                name="Custom",
                style_instructions="生成期间更新的配置",
                preview_path=None,
            )
            return [preview]

    result = await StylePreviewUseCases(catalog, Generator()).generate_preview(
        style_id="custom_style",
        scope=StyleScope(
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
        ),
        prompt="portrait",
    )

    assert result.path == tmp_path / "alice/_account/styles/custom_style/reference.png"
    assert result.path.read_bytes() == b"generated-image"
    assert result.media_type == "image/png"
    assert result.filename == "preview_custom_style.png"
    assert catalog.saved[-1][1].preview_path == (
        "styles/custom_style/reference.png"
    )
    assert catalog.saved[-1][1].style_instructions == "生成期间更新的配置"


@pytest.mark.asyncio
async def test_style_preview_generation_surfaces_generator_error(tmp_path) -> None:
    catalog = _Catalog()
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="Custom",
        preview_path=None,
    )

    class Generator:
        async def generate(self, **_):
            raise RuntimeError("provider rejected image request")

    with pytest.raises(
        StyleRejected,
        match="Preview generation failed: provider rejected image request",
    ):
        await StylePreviewUseCases(catalog, Generator()).generate_preview(
            style_id="custom_style",
            scope=StyleScope(
                username="alice",
                project_name="demo",
                project_dir=tmp_path,
            ),
            prompt="portrait",
        )


@pytest.mark.asyncio
async def test_style_preview_task_schedules_existing_custom_style(tmp_path) -> None:
    catalog = _Catalog()
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="Custom",
        label="自定义风格",
        is_preset=False,
    )

    class Scheduler:
        def __init__(self) -> None:
            self.calls = []

        async def enqueue_style_preview(self, context, task):
            self.calls.append((context, task))
            return AssetTaskQueueReceipt(
                task_id="task-1",
                task_key="task-key-1",
                backend="inline",
                queue="default",
            )

    scheduler = Scheduler()
    task_context = SimpleNamespace(project_id="project-1")
    scheduled = await StylePreviewTaskUseCases(catalog, scheduler).schedule_preview(
        task_context=task_context,
        scope=StyleScope(
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
        ),
        style_id="custom_style",
        prompt="日系二次元校园",
    )

    assert scheduled.task_type == "style_preview"
    assert scheduled.task_id == "task-1"
    assert scheduler.calls[0][0] is task_context
    task = scheduler.calls[0][1]
    assert task.backend_payload() == {
        "style_id": "custom_style",
        "prompt": "日系二次元校园",
    }
    assert task.scope.startswith("style_preview__")


def test_upload_style_preview_updates_existing_style_record(tmp_path) -> None:
    catalog = _Catalog(tmp_path)
    catalog.styles["custom_style"] = SimpleNamespace(
        id="custom_style",
        name="Custom",
        preview_path=None,
    )

    preview_path = StyleCatalogUseCases(catalog).upload_style_preview(
        scope=StyleScope(
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
        ),
        style_id="custom_style",
        content=b"image",
        filename="reference.png",
        content_type="image/png",
    )

    assert preview_path == "styles/custom_style/reference.png"
    assert catalog.saved[-1][1].preview_path == preview_path
